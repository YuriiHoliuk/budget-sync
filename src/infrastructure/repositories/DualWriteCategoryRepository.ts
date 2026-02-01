import type { Category } from '@domain/entities/Category.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { LOGGER_TOKEN } from '@modules/logging/Logger.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_CATEGORY_REPOSITORY_TOKEN } from './database/tokens.ts';
import { SPREADSHEET_CATEGORY_REPOSITORY_TOKEN } from './spreadsheet/tokens.ts';

@injectable()
export class DualWriteCategoryRepository implements CategoryRepository {
  constructor(
    @inject(DATABASE_CATEGORY_REPOSITORY_TOKEN)
    private readonly dbRepo: CategoryRepository,
    @inject(SPREADSHEET_CATEGORY_REPOSITORY_TOKEN)
    private readonly spreadsheetRepo: CategoryRepository,
    @inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  findAll(): Promise<Category[]> {
    return this.dbRepo.findAll();
  }

  findByName(name: string): Promise<Category | null> {
    return this.dbRepo.findByName(name);
  }

  findActive(): Promise<Category[]> {
    return this.dbRepo.findActive();
  }

  async save(category: Category): Promise<void> {
    await this.dbRepo.save(category);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(category));
  }

  async saveAndReturn(category: Category): Promise<Category> {
    const saved = await this.dbRepo.saveAndReturn(category);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(saved));
    return saved;
  }

  private async mirrorToSpreadsheet(
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.logger.warn('Spreadsheet mirror write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
