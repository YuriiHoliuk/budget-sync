/**
 * Categorization rule spreadsheet schema definition
 *
 * Defines the structure of the categorization rules sheet.
 * Rules are free-form text that the LLM follows with highest priority.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for categorization rules in the spreadsheet
 */
export const CATEGORIZATION_RULES_SHEET_NAME = 'Правила категорій';

/**
 * Schema defining the structure of the categorization rules sheet.
 *
 * The sheet has a single column containing free-form rule text.
 */
export const categorizationRuleSchema = {
  rule: {
    name: 'Правило',
    type: 'string',
    required: true,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the categorization rule schema
 */
export type CategorizationRuleSchema = typeof categorizationRuleSchema;
