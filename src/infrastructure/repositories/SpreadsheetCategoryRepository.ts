/**
 * SpreadsheetCategoryRepository - Category repository backed by Google Spreadsheet
 *
 * Extends BaseSpreadsheetRepository for spreadsheet operations and implements
 * CategoryRepository interface from domain layer.
 */

import type { Category } from '@domain/entities/Category.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import { inject, injectable } from 'tsyringe';
import {
  type CategoryRecord,
  SpreadsheetCategoryMapper,
} from '../mappers/SpreadsheetCategoryMapper.ts';
import { BaseSpreadsheetRepository } from './base/BaseSpreadsheetRepository.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  type SpreadsheetConfig,
} from './SpreadsheetAccountRepository.ts';
import {
  CATEGORIES_SHEET_NAME,
  type CategorySchema,
  categorySchema,
} from './schemas/categorySchema.ts';

/**
 * Repository for Category entities stored in a Google Spreadsheet.
 *
 * Extends BaseSpreadsheetRepository for common spreadsheet operations
 * and implements CategoryRepository interface from domain layer.
 */
@injectable()
export class SpreadsheetCategoryRepository
  extends BaseSpreadsheetRepository<Category, CategorySchema, CategoryRecord>
  implements CategoryRepository
{
  private readonly mapper = new SpreadsheetCategoryMapper();

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
  ) {
    super(client, config.spreadsheetId, CATEGORIES_SHEET_NAME, categorySchema);
  }

  protected toEntity(record: CategoryRecord): Category {
    return this.mapper.toEntity(record);
  }

  protected toRecord(entity: Category): CategoryRecord {
    return this.mapper.toRecord(entity);
  }

  /**
   * Find a category by its name.
   * Name matching is case-sensitive.
   */
  findByName(name: string): Promise<Category | null> {
    return this.findBy((record) => record.name === name);
  }

  /**
   * Find all active categories.
   * A category is active if its status is "active" or if status is not set.
   */
  findActive(): Promise<Category[]> {
    return this.findAllBy((record) => {
      const status = record.status?.toLowerCase().trim();
      return !status || status === CategoryStatus.ACTIVE;
    });
  }
}
