/**
 * Budget spreadsheet schema definition
 *
 * Maps domain Budget entity fields to spreadsheet columns.
 * Column names are in Ukrainian to match the actual spreadsheet.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for budgets in the spreadsheet
 */
export const BUDGETS_SHEET_NAME = 'Бюджети';

/**
 * Schema defining the structure of the budgets sheet.
 *
 * Required columns must exist in the spreadsheet header.
 * Optional columns (required: false) may be missing.
 */
export const budgetSchema = {
  dbId: {
    name: 'ID',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  name: {
    name: 'Назва',
    type: 'string',
    required: true,
  } as ColumnDefinition,
  amount: {
    name: 'Сума',
    type: 'number',
    required: true,
  } as ColumnDefinition,
  currency: {
    name: 'Валюта',
    type: 'string',
    required: true,
  } as ColumnDefinition,
  startDate: {
    name: 'Дата початку',
    type: 'date',
    required: false,
  } as ColumnDefinition,
  endDate: {
    name: 'Дата закінчення',
    type: 'date',
    required: false,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the budget schema
 */
export type BudgetSchema = typeof budgetSchema;
