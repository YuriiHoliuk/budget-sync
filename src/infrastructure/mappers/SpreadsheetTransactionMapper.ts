/**
 * SpreadsheetTransactionMapper - Maps between Transaction entity and spreadsheet records
 *
 * Handles conversion between minor units (kopecks) and major units (hryvnias),
 * and maps transaction properties to spreadsheet column format.
 */

import { Transaction } from '@domain/entities/Transaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';

/**
 * Transaction record type matching the spreadsheet schema.
 * This explicit interface ensures type safety when mapping to/from the spreadsheet.
 *
 * Required fields must have values; optional fields may be undefined.
 */
export interface TransactionRecord {
  /** External ID from source system (for deduplication) */
  externalId?: string;
  /** Transaction date */
  date: Date;
  /** Amount in major units (hryvnias), signed (negative for debits) */
  amount: number;
  /** Currency code (e.g., "UAH", "USD") */
  currency: string;
  /** Account name for display */
  account: string;
  /** Account external ID (from bank) */
  accountExternalId?: string;
  /** User-defined category (empty on sync) */
  category?: string;
  /** Budget reference (empty on sync) */
  budget?: string;
  /** Merchant Category Code */
  mcc?: number;
  /** Category from bank */
  bankCategory?: string;
  /** Description from bank */
  bankDescription?: string;
  /** Counterparty name */
  counterparty?: string;
  /** User-defined tags */
  tags?: string;
  /** User notes */
  notes?: string;
}

/**
 * Mapper for converting between Transaction domain entity and spreadsheet records.
 */
export class SpreadsheetTransactionMapper {
  /**
   * Convert a domain Transaction entity to a spreadsheet record.
   *
   * @param transaction - The domain transaction entity
   * @param accountName - Account name for display in spreadsheet
   * @returns A record suitable for spreadsheet storage
   */
  toRecord(transaction: Transaction, accountName: string): TransactionRecord {
    // Convert amount to major units (hryvnias) and negate if debit
    const amountInMajorUnits = transaction.amount.toMajorUnits();
    const signedAmount = transaction.isDebit
      ? -amountInMajorUnits
      : amountInMajorUnits;

    return {
      externalId: transaction.externalId,
      date: transaction.date,
      amount: signedAmount,
      currency: transaction.amount.currency.code,
      account: accountName,
      accountExternalId: transaction.accountId,
      category: undefined,
      budget: undefined,
      mcc: transaction.mcc,
      bankCategory: undefined,
      bankDescription: transaction.description,
      counterparty: transaction.counterpartyName,
      tags: undefined,
      notes: transaction.comment,
    };
  }

  /**
   * Convert a spreadsheet record to a domain Transaction entity.
   *
   * @param record - The spreadsheet record
   * @param accountId - The account ID for the transaction
   * @returns A domain Transaction entity
   */
  toEntity(record: TransactionRecord, accountId: string): Transaction {
    const currency = Currency.fromCode(record.currency);

    // Convert from major units (hryvnias) to minor units (kopecks)
    const amountInMinorUnits = Math.round(Math.abs(record.amount) * 100);
    const amount = Money.create(amountInMinorUnits, currency);

    // Determine transaction type based on sign of amount
    const transactionType =
      record.amount >= 0 ? TransactionType.CREDIT : TransactionType.DEBIT;

    return Transaction.create({
      externalId: record.externalId ?? '',
      date: record.date,
      amount,
      description: record.bankDescription ?? '',
      type: transactionType,
      accountId,
      mcc: record.mcc,
      comment: record.notes,
      counterpartyName: record.counterparty,
    });
  }
}
