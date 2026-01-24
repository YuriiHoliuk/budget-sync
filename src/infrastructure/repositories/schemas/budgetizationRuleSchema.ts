/**
 * Budgetization rule spreadsheet schema definition
 *
 * Defines the structure of the budgetization rules sheet.
 * Rules are free-form text that the LLM follows with highest priority
 * when assigning budgets to transactions.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for budgetization rules in the spreadsheet
 */
export const BUDGETIZATION_RULES_SHEET_NAME = 'Правила бюджетів';

/**
 * Schema defining the structure of the budgetization rules sheet.
 *
 * The sheet has a single column containing free-form rule text.
 */
export const budgetizationRuleSchema = {
  rule: {
    name: 'Правило',
    type: 'string',
    required: true,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the budgetization rule schema
 */
export type BudgetizationRuleSchema = typeof budgetizationRuleSchema;
