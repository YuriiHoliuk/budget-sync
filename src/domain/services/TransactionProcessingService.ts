const CANCELLATION_PREFIX = 'Скасування. ';

/**
 * Input data for a bank transaction to be processed.
 * This is a plain data structure, NOT the BankTransaction entity.
 */
export interface BankTransactionData {
  externalId: string;
  date: Date;
  /** Signed, minor units (negative for debit) */
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  bankDescription?: string;
  counterparty?: string;
  counterpartyIban?: string;
  mcc?: number;
  /** Minor units, always >= 0 */
  commission?: number;
}

/**
 * Context needed to process a bank transaction.
 */
export interface ProcessingContext {
  /** The account ID being processed */
  accountId: number;
}

/**
 * A processed transaction ready to be persisted.
 * Amount is always positive (direction indicated by type).
 */
export interface ProcessedTransaction {
  date: Date;
  /** Always positive, minor units */
  amount: number;
  currency: string;
  type: 'credit' | 'debit' | 'transfer' | 'returning';
  accountId: number;
  description: string;
  counterparty?: string;
  counterpartyIban?: string;
  mcc?: number;
}

/**
 * Result of processing a single bank transaction.
 * Contains the logical transaction(s) to create and metadata about detection.
 */
export interface ProcessingResult {
  /** The main logical transaction to create. Null if fully cancelled. */
  transaction: ProcessedTransaction | null;
  /** Whether this bank transaction is a cancellation/returning */
  isReturning: boolean;
  /** The stripped description of the original transaction (without "Скасування. " prefix) */
  returningOriginalDescription?: string;
  /** Whether this bank transaction has a separate commission fee */
  hasFee: boolean;
  /** The commission fee amount in minor units (positive) */
  feeAmount?: number;
}

/**
 * Pure domain service for processing bank transactions into logical transactions.
 *
 * Given bank transaction data and context, determines what logical
 * transaction(s) to create. This service contains no I/O and no
 * injected dependencies -- it is a pure function of its inputs.
 *
 * Detection rules are applied in priority order:
 * 1. Cancellation/returning -- bankDescription starts with "Скасування. "
 * 2. Fee split -- commission > 0
 * 3. Normal -- default case
 *
 * Transfer detection is handled separately in the application layer
 * via amount + time window matching (see TransactionSyncService.detectTransfers).
 */
export class TransactionProcessingService {
  /**
   * Process a single bank transaction and determine what logical transaction(s) to create.
   */
  process(
    bankTransaction: BankTransactionData,
    context: ProcessingContext,
  ): ProcessingResult {
    if (this.isCancellation(bankTransaction)) {
      return this.processCancellation(bankTransaction, context);
    }

    if (this.hasFee(bankTransaction)) {
      return this.processWithFee(bankTransaction, context);
    }

    return this.processNormal(bankTransaction, context);
  }

  private isCancellation(bankTransaction: BankTransactionData): boolean {
    return (
      bankTransaction.type === 'credit' &&
      (bankTransaction.bankDescription?.startsWith(CANCELLATION_PREFIX) ??
        false)
    );
  }

  private hasFee(bankTransaction: BankTransactionData): boolean {
    return (
      bankTransaction.commission !== undefined && bankTransaction.commission > 0
    );
  }

  private processCancellation(
    bankTransaction: BankTransactionData,
    context: ProcessingContext,
  ): ProcessingResult {
    const originalDescription = this.stripCancellationPrefix(
      bankTransaction.bankDescription ?? '',
    );

    const transaction: ProcessedTransaction = {
      date: bankTransaction.date,
      amount: Math.abs(bankTransaction.amount),
      currency: bankTransaction.currency,
      type: 'returning',
      accountId: context.accountId,
      description: originalDescription,
      counterparty: bankTransaction.counterparty,
      counterpartyIban: bankTransaction.counterpartyIban,
      mcc: bankTransaction.mcc,
    };

    return {
      transaction,
      isReturning: true,
      returningOriginalDescription: originalDescription,
      hasFee: false,
    };
  }

  private processWithFee(
    bankTransaction: BankTransactionData,
    context: ProcessingContext,
  ): ProcessingResult {
    const commission = bankTransaction.commission ?? 0;
    const totalAmount = Math.abs(bankTransaction.amount);
    const mainAmount = totalAmount - commission;

    const transaction: ProcessedTransaction = {
      date: bankTransaction.date,
      amount: mainAmount,
      currency: bankTransaction.currency,
      type: bankTransaction.type,
      accountId: context.accountId,
      description: bankTransaction.bankDescription ?? '',
      counterparty: bankTransaction.counterparty,
      counterpartyIban: bankTransaction.counterpartyIban,
      mcc: bankTransaction.mcc,
    };

    return {
      transaction,
      isReturning: false,
      hasFee: true,
      feeAmount: commission,
    };
  }

  private processNormal(
    bankTransaction: BankTransactionData,
    context: ProcessingContext,
  ): ProcessingResult {
    const transaction: ProcessedTransaction = {
      date: bankTransaction.date,
      amount: Math.abs(bankTransaction.amount),
      currency: bankTransaction.currency,
      type: bankTransaction.type,
      accountId: context.accountId,
      description: bankTransaction.bankDescription ?? '',
      counterparty: bankTransaction.counterparty,
      counterpartyIban: bankTransaction.counterpartyIban,
      mcc: bankTransaction.mcc,
    };

    return {
      transaction,
      isReturning: false,
      hasFee: false,
    };
  }

  private stripCancellationPrefix(description: string): string {
    if (description.startsWith(CANCELLATION_PREFIX)) {
      return description.slice(CANCELLATION_PREFIX.length).trim();
    }
    return description;
  }
}
