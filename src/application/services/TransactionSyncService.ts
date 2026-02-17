import {
  Transaction,
  type TransactionProps,
} from '@domain/entities/Transaction.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type {
  ProcessingContext,
  ProcessingResult,
  TransactionProcessingService,
} from '@domain/services/TransactionProcessingService.ts';
import type { Logger } from '@modules/logging/index.ts';
import { transactionToBankTransaction } from './BankTransactionMapper.ts';

/**
 * Result of processing a batch of incoming transactions.
 */
export interface TransactionSyncResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
}

/**
 * Shared application service that encapsulates the common sync logic for
 * processing incoming bank transactions: deduplication, field merging,
 * saving new/updated transactions, and persisting raw bank transaction records.
 *
 * Used by SyncTransactions, SyncMonobank, and ProcessIncomingTransaction
 * to avoid duplicated transaction processing code.
 */
export class TransactionSyncService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly bankTransactionRepository: BankTransactionRepository,
    private readonly transactionProcessingService: TransactionProcessingService,
    private readonly logger: Logger,
  ) {}

  /**
   * Process a batch of incoming transactions: categorize into new/update/skip,
   * save them, and persist raw bank transaction records.
   */
  async processBatch(
    transactions: Transaction[],
    accountDbId: number | null,
  ): Promise<TransactionSyncResult> {
    if (transactions.length === 0) {
      return { newCount: 0, updatedCount: 0, skippedCount: 0 };
    }

    const externalIds = transactions.map(
      (transaction) => transaction.externalId,
    );
    const existingTransactions =
      await this.transactionRepository.findByExternalIds(externalIds);

    const { newTransactions, transactionsToUpdate, skippedCount } =
      this.categorizeTransactions(transactions, existingTransactions);

    await this.saveNewTransactions(newTransactions);
    await this.updateExistingTransactions(transactionsToUpdate);

    await this.saveBankTransactions(transactions, accountDbId);

    return {
      newCount: newTransactions.length,
      updatedCount: transactionsToUpdate.length,
      skippedCount,
    };
  }

  /**
   * Process a single incoming transaction: check for duplicates, save if new,
   * and persist the raw bank transaction record.
   * Returns the saved transaction (with dbId) if saved, or null if duplicate.
   */
  async processSingle(
    transaction: Transaction,
    accountDbId: number | null,
  ): Promise<Transaction | null> {
    const isDuplicate = await this.isDuplicate(transaction.externalId);
    if (isDuplicate) {
      return null;
    }

    const savedTransaction =
      await this.transactionRepository.saveAndReturn(transaction);
    await this.saveSingleBankTransaction(savedTransaction, accountDbId);

    return savedTransaction;
  }

  /**
   * Classify a Transaction entity using the TransactionProcessingService.
   * Returns processing metadata (cancellation, transfer, fee split detection).
   */
  classifyTransaction(
    transaction: Transaction,
    context: ProcessingContext,
  ): ProcessingResult {
    return this.transactionProcessingService.process(
      {
        externalId: transaction.externalId,
        date: transaction.date,
        amount: transaction.amount.amount,
        currency: transaction.amount.currency.code,
        type: transaction.isCredit ? 'credit' : 'debit',
        bankDescription: transaction.description,
        counterparty: transaction.counterpartyName,
        counterpartyIban: transaction.counterpartyIban,
        mcc: transaction.mcc,
        commission: transaction.commissionRate?.amount,
      },
      context,
    );
  }

  /**
   * Check if a transaction already exists (by externalId).
   */
  async isDuplicate(externalId: string): Promise<boolean> {
    const existing =
      await this.transactionRepository.findByExternalId(externalId);
    return existing !== null;
  }

  /**
   * Categorize incoming transactions into new, to update, or skipped.
   */
  private categorizeTransactions(
    incomingTransactions: Transaction[],
    existingTransactions: Map<string, Transaction>,
  ): {
    newTransactions: Transaction[];
    transactionsToUpdate: Transaction[];
    skippedCount: number;
  } {
    const newTransactions: Transaction[] = [];
    const transactionsToUpdate: Transaction[] = [];
    let skippedCount = 0;

    for (const incoming of incomingTransactions) {
      const existing = existingTransactions.get(incoming.externalId);

      if (!existing) {
        newTransactions.push(incoming);
        continue;
      }

      if (this.hasFieldsToUpdate(existing, incoming)) {
        const merged = this.mergeTransactions(existing, incoming);
        transactionsToUpdate.push(merged);
      } else {
        skippedCount++;
      }
    }

    return { newTransactions, transactionsToUpdate, skippedCount };
  }

  /**
   * Save new transactions to the repository (sorted by date ascending).
   */
  private async saveNewTransactions(
    transactions: Transaction[],
  ): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    const sortedTransactions = [...transactions].sort(
      (txA, txB) => txA.date.getTime() - txB.date.getTime(),
    );

    await this.transactionRepository.saveMany(sortedTransactions);
  }

  /**
   * Update existing transactions with new bank data.
   */
  private async updateExistingTransactions(
    transactions: Transaction[],
  ): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    await this.transactionRepository.updateMany(transactions);
  }

  /**
   * Save bank transaction records for a batch (best-effort, deduplicates).
   */
  private async saveBankTransactions(
    transactions: Transaction[],
    accountDbId: number | null,
  ): Promise<void> {
    if (accountDbId === null || transactions.length === 0) {
      return;
    }

    try {
      const externalIds = transactions.map(
        (transaction) => transaction.externalId,
      );
      const existingBankTransactions =
        await this.bankTransactionRepository.findByExternalIds(externalIds);

      const newBankTransactions = transactions
        .filter(
          (transaction) =>
            !existingBankTransactions.has(transaction.externalId),
        )
        .map((transaction) =>
          transactionToBankTransaction(transaction, accountDbId),
        );

      if (newBankTransactions.length > 0) {
        await this.bankTransactionRepository.saveMany(newBankTransactions);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save bank transactions: ${errorMessage}`, {
        error: errorMessage,
      });
    }
  }

  /**
   * Save a single bank transaction record (best-effort, deduplicates).
   */
  private async saveSingleBankTransaction(
    transaction: Transaction,
    accountDbId: number | null,
  ): Promise<void> {
    if (accountDbId === null) {
      return;
    }

    try {
      const existing = await this.bankTransactionRepository.findByExternalId(
        transaction.externalId,
      );
      if (existing) {
        return;
      }

      const bankTransaction = transactionToBankTransaction(
        transaction,
        accountDbId,
      );
      await this.bankTransactionRepository.save(bankTransaction);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save bank transaction: ${errorMessage}`, {
        externalId: transaction.externalId,
        error: errorMessage,
      });
    }
  }

  /**
   * Check if incoming transaction has bank-provided fields missing in existing.
   */
  private hasFieldsToUpdate(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return (
      this.hasMissingAccountId(existing, incoming) ||
      this.hasNewGroupAFields(existing, incoming) ||
      this.hasNewGroupBFields(existing, incoming) ||
      this.hasNewOtherBankFields(existing, incoming)
    );
  }

  private hasMissingAccountId(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return !existing.accountId && !!incoming.accountId;
  }

  private hasNewGroupAFields(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return (
      (existing.balance === undefined && incoming.balance !== undefined) ||
      (existing.operationAmount === undefined &&
        incoming.operationAmount !== undefined) ||
      (existing.counterpartyIban === undefined &&
        incoming.counterpartyIban !== undefined) ||
      (existing.isHold === false && incoming.isHold === true)
    );
  }

  private hasNewGroupBFields(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return (
      (existing.cashbackAmount === undefined &&
        incoming.cashbackAmount !== undefined) ||
      (existing.commissionRate === undefined &&
        incoming.commissionRate !== undefined) ||
      (existing.originalMcc === undefined &&
        incoming.originalMcc !== undefined) ||
      (existing.receiptId === undefined && incoming.receiptId !== undefined) ||
      (existing.invoiceId === undefined && incoming.invoiceId !== undefined) ||
      (existing.counterEdrpou === undefined &&
        incoming.counterEdrpou !== undefined)
    );
  }

  private hasNewOtherBankFields(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return (
      (existing.counterpartyName === undefined &&
        incoming.counterpartyName !== undefined) ||
      (existing.mcc === undefined && incoming.mcc !== undefined) ||
      (existing.comment === undefined && incoming.comment !== undefined)
    );
  }

  /**
   * Merge transactions: keep user data from existing, update bank data from incoming.
   */
  private mergeTransactions(
    existing: Transaction,
    incoming: Transaction,
  ): Transaction {
    const mergedProps: TransactionProps = {
      externalId: existing.externalId,
      accountId: existing.accountId || incoming.accountId,
      date: incoming.date,
      amount: incoming.amount,
      description: incoming.description,
      type: incoming.type,
      ...this.mergeOptionalBankFields(existing, incoming),
      comment: existing.comment ?? incoming.comment,
    };

    return Transaction.create(mergedProps, existing.id);
  }

  private mergeOptionalBankFields(
    existing: Transaction,
    incoming: Transaction,
  ): Partial<TransactionProps> {
    return {
      ...this.mergeGroupAFields(existing, incoming),
      ...this.mergeGroupBAndOtherFields(existing, incoming),
    };
  }

  private mergeGroupAFields(
    existing: Transaction,
    incoming: Transaction,
  ): Partial<TransactionProps> {
    return {
      operationAmount: incoming.operationAmount ?? existing.operationAmount,
      balance: incoming.balance ?? existing.balance,
      counterpartyIban: incoming.counterpartyIban ?? existing.counterpartyIban,
      hold: incoming.isHold || existing.isHold,
      mcc: incoming.mcc ?? existing.mcc,
      counterpartyName: incoming.counterpartyName ?? existing.counterpartyName,
    };
  }

  private mergeGroupBAndOtherFields(
    existing: Transaction,
    incoming: Transaction,
  ): Partial<TransactionProps> {
    return {
      cashbackAmount: incoming.cashbackAmount ?? existing.cashbackAmount,
      commissionRate: incoming.commissionRate ?? existing.commissionRate,
      originalMcc: incoming.originalMcc ?? existing.originalMcc,
      receiptId: incoming.receiptId ?? existing.receiptId,
      invoiceId: incoming.invoiceId ?? existing.invoiceId,
      counterEdrpou: incoming.counterEdrpou ?? existing.counterEdrpou,
    };
  }
}
