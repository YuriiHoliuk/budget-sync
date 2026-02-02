import type { Budget } from '@domain/entities/Budget.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { LOGGER_TOKEN } from '@modules/logging/Logger.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_BUDGET_REPOSITORY_TOKEN } from './database/tokens.ts';
import { SPREADSHEET_BUDGET_REPOSITORY_TOKEN } from './spreadsheet/tokens.ts';

@injectable()
export class DualWriteBudgetRepository implements BudgetRepository {
  constructor(
    @inject(DATABASE_BUDGET_REPOSITORY_TOKEN)
    private readonly dbRepo: BudgetRepository,
    @inject(SPREADSHEET_BUDGET_REPOSITORY_TOKEN)
    private readonly spreadsheetRepo: BudgetRepository,
    @inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  findAll(): Promise<Budget[]> {
    return this.dbRepo.findAll();
  }

  findById(id: number): Promise<Budget | null> {
    return this.dbRepo.findById(id);
  }

  findByName(name: string): Promise<Budget | null> {
    return this.dbRepo.findByName(name);
  }

  findActive(date: Date): Promise<Budget[]> {
    return this.dbRepo.findActive(date);
  }

  async save(budget: Budget): Promise<void> {
    await this.dbRepo.save(budget);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(budget));
  }

  async saveAndReturn(budget: Budget): Promise<Budget> {
    const saved = await this.dbRepo.saveAndReturn(budget);
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
