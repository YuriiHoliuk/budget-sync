/**
 * SpreadsheetBudgetizationRuleRepository - Budgetization rules backed by Google Spreadsheet
 *
 * Reads user-defined budgetization rules from the spreadsheet.
 * Rules are free-form text that the LLM follows with highest priority
 * when assigning budgets to transactions.
 */

import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import { SpreadsheetTable } from '@modules/spreadsheet/SpreadsheetTable.ts';
import type { SchemaToRecord } from '@modules/spreadsheet/types.ts';
import { inject, injectable } from 'tsyringe';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  type SpreadsheetConfig,
} from './SpreadsheetAccountRepository.ts';
import {
  BUDGETIZATION_RULES_SHEET_NAME,
  type BudgetizationRuleSchema,
  budgetizationRuleSchema,
} from './schemas/budgetizationRuleSchema.ts';

/**
 * Record type for budgetization rule rows
 */
type BudgetizationRuleRecord = SchemaToRecord<BudgetizationRuleSchema>;

/**
 * Repository for budgetization rules stored in a Google Spreadsheet.
 *
 * Unlike other repositories, this doesn't use BaseSpreadsheetRepository
 * since rules are simple strings without complex entity mapping.
 */
@injectable()
export class SpreadsheetBudgetizationRuleRepository
  implements BudgetizationRuleRepository
{
  private readonly table: SpreadsheetTable<BudgetizationRuleSchema>;

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
  ) {
    this.table = new SpreadsheetTable(
      client,
      config.spreadsheetId,
      BUDGETIZATION_RULES_SHEET_NAME,
      budgetizationRuleSchema,
    );
  }

  /**
   * Find all budgetization rules.
   *
   * Filters out empty rows and returns only non-empty rule strings.
   */
  async findAll(): Promise<string[]> {
    const rows = await this.table.readRows({ skipInvalidRows: true });
    return rows
      .map((row: BudgetizationRuleRecord) => row.rule)
      .filter((rule): rule is string => typeof rule === 'string')
      .map((rule) => rule.trim())
      .filter((rule) => Boolean(rule));
  }
}
