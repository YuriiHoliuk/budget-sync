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
import { Money, TransactionType } from '@domain/value-objects/index.ts';
import type { Logger } from '@modules/logging/index.ts';
import { transactionToBankTransaction } from './BankTransactionMapper.ts';

/**
 * Result of processing a batch of incoming transactions.
 */
export interface TransactionSyncResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  /** Newly saved transactions (with dbIds) for post-processing like transfer detection. */
  savedTransactions: Transaction[];
}

/** Time window for matching transfer candidates (5 minutes). */
const TRANSFER_TIME_WINDOW_MS = 5 * 60 * 1000;

/** Time window for matching cancellation/returning candidates (30 days). */
const RETURNING_TIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
      return {
        newCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        savedTransactions: [],
      };
    }

    const externalIds = transactions.map(
      (transaction) => transaction.externalId,
    );
    const existingTransactions =
      await this.transactionRepository.findByExternalIds(externalIds);

    const { newTransactions, transactionsToUpdate, skippedCount } =
      this.categorizeTransactions(transactions, existingTransactions);

    const savedTransactions = await this.saveNewTransactions(newTransactions);
    await this.updateExistingTransactions(transactionsToUpdate);

    await this.saveBankTransactions(transactions, accountDbId);

    return {
      newCount: newTransactions.length,
      updatedCount: transactionsToUpdate.length,
      skippedCount,
      savedTransactions,
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
   * Detect transfers among newly saved transactions by matching amount + time window.
   * For each transaction, looks for a candidate on a different own account with
   * the same absolute amount, opposite type, within ±5 minutes.
   */
  async detectTransfers(
    savedTransactions: Transaction[],
    accountDbId: number,
    ownAccountIds: number[],
  ): Promise<Set<number>> {
    const transferredIds = new Set<number>();
    if (ownAccountIds.length <= 1) {
      return transferredIds;
    }

    for (const transaction of savedTransactions) {
      const transferredId = await this.detectTransferForTransaction(
        transaction,
        accountDbId,
        ownAccountIds,
      );
      if (transferredId !== null) {
        transferredIds.add(transferredId);
      }
    }
    return transferredIds;
  }

  private async detectTransferForTransaction(
    transaction: Transaction,
    accountDbId: number,
    ownAccountIds: number[],
  ): Promise<number | null> {
    const dbId = transaction.dbId;
    if (dbId === null) {
      return null;
    }

    const oppositeType: 'credit' | 'debit' = transaction.isCredit
      ? 'debit'
      : 'credit';
    const dateFrom = new Date(
      transaction.date.getTime() - TRANSFER_TIME_WINDOW_MS,
    );
    const dateTo = new Date(
      transaction.date.getTime() + TRANSFER_TIME_WINDOW_MS,
    );

    const candidate = await this.transactionRepository.findTransferCandidate({
      absoluteAmount: Math.abs(transaction.amount.amount),
      oppositeType,
      excludeAccountId: accountDbId,
      ownAccountIds,
      dateFrom,
      dateTo,
    });

    if (!candidate) {
      return null;
    }

    await this.transactionRepository.updateRecordType(dbId, 'transfer');
    await this.transactionRepository.updateRecordType(candidate.id, 'transfer');

    const outgoingId = transaction.isDebit ? dbId : candidate.id;
    const incomingId = transaction.isDebit ? candidate.id : dbId;
    await this.transactionRepository.createTransferPair(outgoingId, incomingId);

    this.logger.info('Transfer detected and paired', {
      outgoingId,
      incomingId,
      amount: Math.abs(transaction.amount.amount),
    });

    return dbId;
  }

  /**
   * Detect returnings/cancellations among newly saved transactions.
   * For each cancellation credit, find the original debit and either:
   * - Full refund: delete both original and cancellation transactions
   * - Partial refund: reduce original amount, link cancellation bank_tx to original, delete cancellation tx
   *
   * Returns the set of transaction IDs that were deleted,
   * so callers can skip further processing on them.
   */
  async detectReturnings(
    savedTransactions: Transaction[],
    accountDbId: number,
  ): Promise<Set<number>> {
    const deletedIds = new Set<number>();

    for (const transaction of savedTransactions) {
      const deleted = await this.detectReturningForTransaction(
        transaction,
        accountDbId,
      );
      for (const id of deleted) {
        deletedIds.add(id);
      }
    }

    return deletedIds;
  }

  private async detectReturningForTransaction(
    transaction: Transaction,
    accountDbId: number,
  ): Promise<number[]> {
    const dbId = transaction.dbId;
    if (dbId === null) {
      return [];
    }

    const context: ProcessingContext = { accountId: accountDbId };
    const result = this.classifyTransaction(transaction, context);

    if (!result.isReturning || !result.returningOriginalDescription) {
      return [];
    }

    const refundAmount = Math.abs(transaction.amount.amount);
    const dateFrom = new Date(
      transaction.date.getTime() - RETURNING_TIME_WINDOW_MS,
    );
    const dateTo = transaction.date;

    const candidate =
      await this.transactionRepository.findCancellationCandidate({
        accountId: accountDbId,
        bankDescription: result.returningOriginalDescription,
        refundAmount,
        dateFrom,
        dateTo,
      });

    if (!candidate) {
      this.logger.warn('Returning transaction has no matching original', {
        transactionId: dbId,
        description: result.returningOriginalDescription,
        refundAmount,
      });
      return [];
    }

    const originalAmount = candidate.amount;

    if (refundAmount >= originalAmount) {
      // Full refund: delete both cancellation and original transactions
      await this.transactionRepository.delete(transaction.externalId);
      const originalTx = await this.transactionRepository.findByDbId(
        candidate.id,
      );
      if (originalTx) {
        await this.transactionRepository.delete(originalTx.externalId);
      }
      this.logger.info('Full refund: deleted original and cancellation', {
        originalId: candidate.id,
        cancellationId: dbId,
        amount: originalAmount,
      });
      return [dbId, candidate.id];
    }

    // Partial refund: reduce original amount, link cancellation bank_tx to original, delete cancellation tx
    const newOriginalAmount = originalAmount - refundAmount;
    await this.transactionRepository.updateTransactionAmount(
      candidate.id,
      newOriginalAmount,
    );

    // Link cancellation's bank_transaction to the original transaction
    const cancellationBankTx =
      await this.bankTransactionRepository.findByExternalId(
        transaction.externalId,
      );
    if (cancellationBankTx) {
      await this.bankTransactionRepository.linkTransactionSource(
        candidate.id,
        cancellationBankTx.id,
      );
    }

    // Delete the cancellation transaction (bank_tx stays linked to original)
    await this.transactionRepository.delete(transaction.externalId);

    this.logger.info(
      'Partial refund: reduced original, linked bank_tx, deleted cancellation',
      {
        originalId: candidate.id,
        cancellationId: dbId,
        originalAmount,
        newAmount: newOriginalAmount,
        refundAmount,
      },
    );

    return [dbId];
  }

  /**
   * Detect fee splits among newly saved transactions.
   * For transactions with commission > 0, reduce main amount
   * and create a separate fee transaction.
   */
  async detectFeeSplits(
    savedTransactions: Transaction[],
    accountDbId: number,
  ): Promise<void> {
    for (const transaction of savedTransactions) {
      await this.detectFeeSplitForTransaction(transaction, accountDbId);
    }
  }

  private async detectFeeSplitForTransaction(
    transaction: Transaction,
    accountDbId: number,
  ): Promise<void> {
    const dbId = transaction.dbId;
    if (dbId === null) {
      return;
    }

    const context: ProcessingContext = { accountId: accountDbId };
    const result = this.classifyTransaction(transaction, context);

    if (!result.hasFee || !result.feeAmount) {
      return;
    }

    const feeAmount = result.feeAmount;
    // Reduce main transaction amount: e.g. 50000 - 2500 = 47500
    const newAmount = transaction.amount.amount - feeAmount;
    await this.transactionRepository.updateTransactionAmount(dbId, newAmount);

    // Create fee transaction
    const feeTransaction = Transaction.create({
      externalId: `${transaction.externalId}-fee`,
      date: transaction.date,
      amount: Money.create(feeAmount, transaction.amount.currency),
      description: 'Bank commission',
      type: TransactionType.DEBIT,
      accountId: transaction.accountId,
    });

    const savedFee =
      await this.transactionRepository.saveAndReturn(feeTransaction);

    // Link fee transaction to the same bank_transaction
    const bankTx = await this.bankTransactionRepository.findByExternalId(
      transaction.externalId,
    );
    if (bankTx && savedFee.dbId !== null) {
      await this.bankTransactionRepository.linkTransactionSource(
        savedFee.dbId,
        bankTx.id,
      );
    }

    this.logger.info('Fee split: reduced amount, created fee transaction', {
      originalId: dbId,
      feeTransactionId: savedFee.dbId,
      feeAmount,
      newAmount,
    });
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
   * Returns the saved transactions with database IDs assigned.
   */
  private saveNewTransactions(
    transactions: Transaction[],
  ): Promise<Transaction[]> {
    if (transactions.length === 0) {
      return Promise.resolve([]);
    }

    const sortedTransactions = [...transactions].sort(
      (txA, txB) => txA.date.getTime() - txB.date.getTime(),
    );

    return this.transactionRepository.saveManyAndReturn(sortedTransactions);
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
   * Save bank transaction records for a batch (best-effort, deduplicates)
   * and create transaction_sources links.
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

      let savedBankTransactions: import('@domain/entities/BankTransaction.ts').BankTransaction[] =
        [];
      if (newBankTransactions.length > 0) {
        savedBankTransactions =
          await this.bankTransactionRepository.saveMany(newBankTransactions);
      }

      await this.buildAndLinkTransactionSources(
        transactions,
        savedBankTransactions,
        existingBankTransactions,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to save bank transactions: ${errorMessage}`, {
        error: errorMessage,
      });
    }
  }

  /**
   * Build and persist transaction_sources links from saved + existing bank transactions.
   */
  private async buildAndLinkTransactionSources(
    transactions: Transaction[],
    savedBankTransactions: import('@domain/entities/BankTransaction.ts').BankTransaction[],
    existingBankTransactions: Map<
      string,
      import('@domain/entities/BankTransaction.ts').BankTransaction
    >,
  ): Promise<void> {
    const externalIdToBankTxId = new Map<string, number>();
    for (const bankTx of savedBankTransactions) {
      externalIdToBankTxId.set(bankTx.externalId, bankTx.id);
    }
    for (const [extId, bankTx] of existingBankTransactions) {
      externalIdToBankTxId.set(extId, bankTx.id);
    }

    const links: Array<{
      transactionId: number;
      bankTransactionId: number;
    }> = [];
    for (const transaction of transactions) {
      const txDbId = transaction.dbId;
      const bankTxId = externalIdToBankTxId.get(transaction.externalId);
      if (txDbId !== null && bankTxId !== undefined) {
        links.push({ transactionId: txDbId, bankTransactionId: bankTxId });
      }
    }

    if (links.length > 0) {
      await this.bankTransactionRepository.linkTransactionSources(links);
    }
  }

  /**
   * Save a single bank transaction record (best-effort, deduplicates)
   * and create transaction_sources link.
   */
  private async saveSingleBankTransaction(
    transaction: Transaction,
    accountDbId: number | null,
  ): Promise<void> {
    if (accountDbId === null) {
      return;
    }

    try {
      let bankTxId: number | undefined;

      const existing = await this.bankTransactionRepository.findByExternalId(
        transaction.externalId,
      );
      if (existing) {
        bankTxId = existing.id;
      } else {
        const bankTransaction = transactionToBankTransaction(
          transaction,
          accountDbId,
        );
        const saved =
          await this.bankTransactionRepository.save(bankTransaction);
        bankTxId = saved.id;
      }

      const txDbId = transaction.dbId;
      if (txDbId !== null && bankTxId !== undefined) {
        await this.bankTransactionRepository.linkTransactionSource(
          txDbId,
          bankTxId,
        );
      }
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
