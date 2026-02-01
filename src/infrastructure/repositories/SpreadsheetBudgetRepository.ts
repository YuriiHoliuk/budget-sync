/**
 * SpreadsheetBudgetRepository - Budget repository backed by Google Spreadsheet
 *
 * Extends BaseSpreadsheetRepository for spreadsheet operations and implements
 * BudgetRepository interface from domain layer.
 */

import type { Budget } from '@domain/entities/Budget.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import type { SchemaToRecord } from '@modules/spreadsheet/types.ts';
import { inject, injectable } from 'tsyringe';
import {
  type BudgetRecord,
  SpreadsheetBudgetMapper,
} from '../mappers/SpreadsheetBudgetMapper.ts';
import { BaseSpreadsheetRepository } from './base/BaseSpreadsheetRepository.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  type SpreadsheetConfig,
} from './SpreadsheetAccountRepository.ts';
import {
  BUDGETS_SHEET_NAME,
  type BudgetSchema,
  budgetSchema,
} from './schemas/budgetSchema.ts';

/**
 * Repository for Budget entities stored in a Google Spreadsheet.
 *
 * Extends BaseSpreadsheetRepository for common spreadsheet operations
 * and implements BudgetRepository interface from domain layer.
 */
@injectable()
export class SpreadsheetBudgetRepository
  extends BaseSpreadsheetRepository<Budget, BudgetSchema, BudgetRecord>
  implements BudgetRepository
{
  private readonly mapper = new SpreadsheetBudgetMapper();

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
  ) {
    super(client, config.spreadsheetId, BUDGETS_SHEET_NAME, budgetSchema);
  }

  protected toEntity(record: BudgetRecord): Budget {
    return this.mapper.toEntity(record);
  }

  protected toRecord(entity: Budget): BudgetRecord {
    return this.mapper.toRecord(entity);
  }

  /**
   * Find a budget by its name.
   * Name matching is case-sensitive.
   */
  findByName(name: string): Promise<Budget | null> {
    return this.findBy((record) => record.name === name);
  }

  /**
   * Find all budgets active on a given date.
   * A budget is active if the date falls within its start and end dates.
   */
  findActive(date: Date): Promise<Budget[]> {
    return this.findAllBy((record) => {
      const startDate = record.startDate ?? new Date(0);
      const endDate = record.endDate ?? new Date('2099-12-31');
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Save a budget to the spreadsheet.
   * Appends the budget as a new row.
   */
  override async save(budget: Budget): Promise<void> {
    const record = this.toRecord(budget);
    await this.table.appendRow(record as SchemaToRecord<BudgetSchema>);
  }

  /**
   * Save a budget and return it.
   * Spreadsheet doesn't generate IDs, so we just save and return the same budget.
   */
  async saveAndReturn(budget: Budget): Promise<Budget> {
    await this.save(budget);
    return budget;
  }
}
