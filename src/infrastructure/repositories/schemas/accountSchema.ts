/**
 * Account spreadsheet schema definition
 *
 * Maps domain Account entity fields to spreadsheet columns.
 * Column names are in Ukrainian to match the actual spreadsheet.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for accounts in the spreadsheet
 */
export const ACCOUNTS_SHEET_NAME = 'Рахунки';

/**
 * Schema defining the structure of the accounts sheet.
 *
 * Required columns must exist in the spreadsheet header.
 * Optional columns (required: false) may be missing.
 */
export const accountSchema = {
  externalId: {
    name: 'ID (зовнішній)',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  name: {
    name: 'Назва',
    type: 'string',
    required: false, // User-defined, may be empty initially
  } as ColumnDefinition,
  externalName: {
    name: 'Назва (зовнішня)',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  type: {
    name: 'Тип',
    type: 'string',
    required: true,
  } as ColumnDefinition,
  currency: {
    name: 'Валюта',
    type: 'string',
    required: true,
  } as ColumnDefinition,
  balance: {
    name: 'Залишок',
    type: 'number',
    required: true,
  } as ColumnDefinition,
  creditLimit: {
    name: 'Кредитний ліміт',
    type: 'number',
    required: false, // 0 or missing for non-credit accounts
  } as ColumnDefinition,
  iban: {
    name: 'IBAN',
    type: 'string',
    required: false,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the account schema
 */
export type AccountSchema = typeof accountSchema;
