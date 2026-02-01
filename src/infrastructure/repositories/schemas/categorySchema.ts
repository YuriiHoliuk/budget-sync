/**
 * Category spreadsheet schema definition
 *
 * Maps domain Category entity fields to spreadsheet columns.
 * Column names are in Ukrainian to match the actual spreadsheet.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for categories in the spreadsheet
 */
export const CATEGORIES_SHEET_NAME = 'Категорії';

/**
 * Schema defining the structure of the categories sheet.
 *
 * Required columns must exist in the spreadsheet header.
 * Optional columns (required: false) may be missing.
 */
export const categorySchema = {
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
  parent: {
    name: 'Батьківська категорія',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  status: {
    name: 'Статус',
    type: 'string',
    required: false,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the category schema
 */
export type CategorySchema = typeof categorySchema;
