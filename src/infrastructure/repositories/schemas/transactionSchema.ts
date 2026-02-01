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
  dbId: {
    name: 'ID',
    type: 'number',
    required: false,
  } as ColumnDefinition,
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
  balanceAfter: {
    name: 'Залишок після',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  operationAmount: {
    name: 'Сума операції',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  operationCurrency: {
    name: 'Валюта операції',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  counterpartyIban: {
    name: 'IBAN одержувача',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  hold: {
    name: 'Холд',
    type: 'boolean',
    required: false,
  } as ColumnDefinition,
  cashback: {
    name: 'Кешбек',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  commission: {
    name: 'Комісія',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  originalMcc: {
    name: 'MCC (оригінал)',
    type: 'number',
    required: false,
  } as ColumnDefinition,
  receiptId: {
    name: 'Чек ID',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  invoiceId: {
    name: 'Інвойс ID',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  counterEdrpou: {
    name: 'ЄДРПОУ одержувача',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  status: {
    name: 'Статус',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  categoryReason: {
    name: 'Причина категорії',
    type: 'string',
    required: false,
  } as ColumnDefinition,
  budgetReason: {
    name: 'Причина бюджету',
    type: 'string',
    required: false,
  } as ColumnDefinition,
} as const;

/**
 * Type alias for the transaction schema
 */
export type TransactionSchema = typeof transactionSchema;
