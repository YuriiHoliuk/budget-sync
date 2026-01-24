/**
 * SpreadsheetCategorizationRuleRepository - Categorization rules backed by Google Spreadsheet
 *
 * Reads user-defined categorization rules from the spreadsheet.
 * Rules are free-form text that the LLM follows with highest priority.
 */

import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
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
  CATEGORIZATION_RULES_SHEET_NAME,
  type CategorizationRuleSchema,
  categorizationRuleSchema,
} from './schemas/categorizationRuleSchema.ts';

/**
 * Record type for categorization rule rows
 */
type CategorizationRuleRecord = SchemaToRecord<CategorizationRuleSchema>;

/**
 * Repository for categorization rules stored in a Google Spreadsheet.
 *
 * Unlike other repositories, this doesn't use BaseSpreadsheetRepository
 * since rules are simple strings without complex entity mapping.
 */
@injectable()
export class SpreadsheetCategorizationRuleRepository
  implements CategorizationRuleRepository
{
  private readonly table: SpreadsheetTable<CategorizationRuleSchema>;

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
  ) {
    this.table = new SpreadsheetTable(
      client,
      config.spreadsheetId,
      CATEGORIZATION_RULES_SHEET_NAME,
      categorizationRuleSchema,
    );
  }

  /**
   * Find all categorization rules.
   *
   * Filters out empty rows and returns only non-empty rule strings.
   */
  async findAll(): Promise<string[]> {
    const rows = await this.table.readRows({ skipInvalidRows: true });
    return rows
      .map((row: CategorizationRuleRecord) => row.rule)
      .filter((rule): rule is string => typeof rule === 'string')
      .map((rule) => rule.trim())
      .filter((rule) => Boolean(rule));
  }
}
