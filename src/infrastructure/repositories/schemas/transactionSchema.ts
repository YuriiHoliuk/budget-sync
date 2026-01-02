/**
 * Transaction spreadsheet schema definition
 *
 * Maps domain Transaction entity fields to spreadsheet columns.
 * Column names are in Ukrainian to match the actual spreadsheet.
 */

import type { ColumnDefinition } from '@modules/spreadsheet/types.ts';

/**
 * Sheet name for transactions in the spreadsheet
 */
export const TRANSACTIONS_SHEET_NAME = 'Транзакції';

/**
 * Schema defining the structure of the transactions sheet.
 *
 * Required columns must exist in the spreadsheet header.
 * Optional columns (required: false) may be missing.
 */
export const transactionSchema = {
  externalId: {
    name: 'ID (зовнішній)',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  date: {
    name: 'Час',
    type: 'date',
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
  account: {
    name: 'Рахунок',
    type: 'string',
    required: true,
  } as ColumnDefinition,
  accountExternalId: {
    name: 'Рахунок ID',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  category: {
    name: 'Категорія',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  budget: {
    name: 'Бюджет',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  mcc: {
    name: 'MCC',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  bankCategory: {
    name: 'Категорія з банку',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  bankDescription: {
    name: 'Опис з банку',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  counterparty: {
    name: 'Одержувач',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  tags: {
    name: 'Мітки',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  notes: {
    name: 'Примітки',
    type: 'string',
    required: false,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the transaction schema
 */
export type TransactionSchema = typeof transactionSchema;
