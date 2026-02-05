import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { toMajorUnits, toMajorUnitsOrNull } from './money.ts';

export const CATEGORIZATION_STATUS_TO_GQL: Record<string, string> = {
  pending: 'PENDING',
  categorized: 'CATEGORIZED',
  verified: 'VERIFIED',
};

export const TRANSACTION_TYPE_TO_GQL: Record<string, string> = {
  credit: 'CREDIT',
  debit: 'DEBIT',
};

export interface TransactionGql {
  id: number;
  externalId: string;
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
  hold: boolean;
  cashbackAmount: number | null;
  commissionAmount: number | null;
  receiptId: string | null;
  notes: string | null;
  accountId: number | null;
  categoryId: number | null;
  budgetId: number | null;
}

export function mapTransactionRecordToGql(
  record: TransactionRecord,
): TransactionGql {
  return {
    id: record.id,
    externalId: record.externalId ?? '',
    date: record.date.toISOString(),
    amount: toMajorUnits(Math.abs(record.amount)),
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
    hold: record.hold ?? false,
    cashbackAmount: toMajorUnitsOrNull(record.cashback),
    commissionAmount: toMajorUnitsOrNull(record.commission),
    receiptId: record.receiptId,
    notes: record.notes,
    accountId: record.accountId,
    categoryId: record.categoryId,
    budgetId: record.budgetId,
  };
}
