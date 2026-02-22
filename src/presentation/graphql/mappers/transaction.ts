import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { toMajorUnits } from './money.ts';

export const CATEGORIZATION_STATUS_TO_GQL: Record<string, string> = {
  pending: 'PENDING',
  categorized: 'CATEGORIZED',
  verified: 'VERIFIED',
};

export const TRANSACTION_TYPE_TO_GQL: Record<string, string> = {
  credit: 'CREDIT',
  debit: 'DEBIT',
  transfer: 'TRANSFER',
};

export interface TransactionGql {
  id: number;
  date: string;
  amount: number;
  currency: string;
  type: string;
  description: string;
  categorizationStatus: string;
  categoryReason: string | null;
  budgetReason: string | null;
  mcc: number | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  notes: string | null;
  accountId: number | null;
  categoryId: number | null;
  budgetId: number | null;
  bankTransactionCount: number;
}

export interface SiblingTransactionGql {
  id: number;
  amount: number;
  currency: string;
  description: string;
  categoryId: number | null;
  budgetId: number | null;
  category: null;
  budget: null;
}

export function mapTransactionRecordToSiblingGql(
  record: TransactionRecord,
): SiblingTransactionGql {
  return {
    id: record.id,
    amount: toMajorUnits(record.amount),
    currency: record.currency,
    description: record.bankDescription ?? '',
    categoryId: record.categoryId,
    budgetId: record.budgetId,
    category: null,
    budget: null,
  };
}

export function mapTransactionRecordToGql(
  record: TransactionRecord,
): TransactionGql {
  return {
    id: record.id,
    date: record.date.toISOString(),
    amount: toMajorUnits(record.amount),
    currency: record.currency,
    type: TRANSACTION_TYPE_TO_GQL[record.type] ?? 'DEBIT',
    description: record.bankDescription ?? '',
    categorizationStatus:
      CATEGORIZATION_STATUS_TO_GQL[record.categorizationStatus ?? 'pending'] ??
      'PENDING',
    categoryReason: record.categoryReason,
    budgetReason: record.budgetReason,
    mcc: record.mcc,
    counterpartyName: record.counterparty,
    counterpartyIban: record.counterpartyIban,
    notes: record.notes,
    accountId: record.accountId,
    categoryId: record.categoryId,
    budgetId: record.budgetId,
    bankTransactionCount: record.bankTransactionCount,
  };
}
