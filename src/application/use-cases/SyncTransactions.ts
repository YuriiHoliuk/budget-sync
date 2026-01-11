import type { Account } from '@domain/entities/Account.ts';
import {
  Transaction,
  type TransactionProps,
} from '@domain/entities/Transaction.ts';
import { RateLimitError } from '@domain/errors/DomainErrors.ts';
import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { inject, injectable } from 'tsyringe';
import { chunkDateRange, delay } from '../utils/index.ts';
import { UseCase } from './UseCase.ts';

export interface SyncTransactionsResultDTO {
  totalAccounts: number;
  syncedAccounts: number;
  newTransactions: number;
  updatedTransactions: number;
  skippedTransactions: number;
  errors: string[];
}

export interface SyncTransactionsOptions {
  requestDelayMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  earliestSyncDate?: Date;
  syncOverlapMs?: number;
}

const DEFAULT_REQUEST_DELAY_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 60000;
const DEFAULT_EARLIEST_SYNC_DATE = new Date('2026-01-01');
const DEFAULT_SYNC_OVERLAP_MS = 600000; // 10 minutes

@injectable()
export class SyncTransactionsUseCase extends UseCase<
  SyncTransactionsOptions,
  SyncTransactionsResultDTO
> {
  constructor(
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
  ) {
    super();
  }

  async execute(
    options: SyncTransactionsOptions = {},
  ): Promise<SyncTransactionsResultDTO> {
    const config = this.buildConfig(options);
    const result = this.createEmptyResult();

    const accounts = await this.fetchAccountsOrReportError(result);
    if (!accounts) {
      return result;
    }

    result.totalAccounts = accounts.length;
    await this.syncAllAccounts(accounts, config, result);

    return result;
  }

  private buildConfig(options: SyncTransactionsOptions): Required<
    Omit<SyncTransactionsOptions, 'earliestSyncDate'>
  > & {
    earliestSyncDate: Date;
  } {
    return {
      requestDelayMs: options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialBackoffMs: options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS,
      earliestSyncDate: options.earliestSyncDate ?? DEFAULT_EARLIEST_SYNC_DATE,
      syncOverlapMs: options.syncOverlapMs ?? DEFAULT_SYNC_OVERLAP_MS,
    };
  }

  private createEmptyResult(): SyncTransactionsResultDTO {
    return {
      totalAccounts: 0,
      syncedAccounts: 0,
      newTransactions: 0,
      updatedTransactions: 0,
      skippedTransactions: 0,
      errors: [],
    };
  }

  private async fetchAccountsOrReportError(
    result: SyncTransactionsResultDTO,
  ): Promise<Account[] | null> {
    try {
      return await this.accountRepository.findByBank('monobank');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to fetch accounts: ${errorMessage}`);
      return null;
    }
  }

  private async syncAllAccounts(
    accounts: Account[],
    config: ReturnType<typeof this.buildConfig>,
    result: SyncTransactionsResultDTO,
  ): Promise<void> {
    let isFirstRequest = true;

    for (const account of accounts) {
      const syncResult = await this.syncSingleAccount(
        account,
        config,
        isFirstRequest,
      );
      isFirstRequest = false;

      this.mergeAccountResult(result, syncResult);
    }
  }

  private async syncSingleAccount(
    account: Account,
    config: ReturnType<typeof this.buildConfig>,
    isFirstRequest: boolean,
  ): Promise<{
    synced: boolean;
    newTransactions: number;
    updatedTransactions: number;
    skippedTransactions: number;
    error?: string;
  }> {
    try {
      const now = new Date();
      const syncFrom = this.calculateSyncFrom(
        account.lastSyncTime,
        config.earliestSyncDate,
        config.syncOverlapMs,
      );

      const { newCount, updatedCount, skippedCount } =
        await this.syncAccountChunks(
          account.externalId,
          syncFrom,
          now,
          config,
          isFirstRequest,
        );

      await this.accountRepository.updateLastSyncTime(
        account.id,
        now.getTime(),
      );

      return {
        synced: true,
        newTransactions: newCount,
        updatedTransactions: updatedCount,
        skippedTransactions: skippedCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        synced: false,
        newTransactions: 0,
        updatedTransactions: 0,
        skippedTransactions: 0,
        error: `Failed to sync account ${account.externalId}: ${errorMessage}`,
      };
    }
  }

  private async syncAccountChunks(
    accountExternalId: string,
    syncFrom: Date,
    syncTo: Date,
    config: ReturnType<typeof this.buildConfig>,
    isFirstRequest: boolean,
  ): Promise<{ newCount: number; updatedCount: number; skippedCount: number }> {
    const chunks = chunkDateRange(syncFrom, syncTo, 31);
    let totalNewCount = 0;
    let totalUpdatedCount = 0;
    let totalSkippedCount = 0;
    let shouldDelay = !isFirstRequest;

    for (const chunk of chunks) {
      if (shouldDelay) {
        await delay(config.requestDelayMs);
      }
      shouldDelay = true;

      const transactions = await this.fetchTransactionsWithRetry(
        accountExternalId,
        chunk.from,
        chunk.to,
        config.maxRetries,
        config.initialBackoffMs,
      );

      const { newCount, updatedCount, skippedCount } =
        await this.processTransactions(transactions);

      totalNewCount += newCount;
      totalUpdatedCount += updatedCount;
      totalSkippedCount += skippedCount;
    }

    return {
      newCount: totalNewCount,
      updatedCount: totalUpdatedCount,
      skippedCount: totalSkippedCount,
    };
  }

  private mergeAccountResult(
    result: SyncTransactionsResultDTO,
    accountResult: Awaited<ReturnType<typeof this.syncSingleAccount>>,
  ): void {
    if (accountResult.synced) {
      result.syncedAccounts++;
    }
    result.newTransactions += accountResult.newTransactions;
    result.updatedTransactions += accountResult.updatedTransactions;
    result.skippedTransactions += accountResult.skippedTransactions;
    if (accountResult.error) {
      result.errors.push(accountResult.error);
    }
  }

  private calculateSyncFrom(
    lastSyncTime: number | undefined,
    earliestSyncDate: Date,
    syncOverlapMs: number,
  ): Date {
    if (lastSyncTime === undefined) {
      return earliestSyncDate;
    }

    const syncFromWithOverlap = new Date(lastSyncTime - syncOverlapMs);
    return syncFromWithOverlap > earliestSyncDate
      ? syncFromWithOverlap
      : earliestSyncDate;
  }

  private async fetchTransactionsWithRetry(
    accountId: string,
    from: Date,
    to: Date,
    maxRetries: number,
    initialBackoffMs: number,
  ): Promise<Transaction[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.bankGateway.getTransactions(accountId, from, to);
      } catch (error) {
        if (error instanceof RateLimitError && attempt < maxRetries) {
          const backoffMs = initialBackoffMs * 2 ** attempt;
          await delay(backoffMs);
          lastError = error;
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Process incoming transactions: save new ones, update existing ones with missing fields.
   */
  private async processTransactions(
    transactions: Transaction[],
  ): Promise<{ newCount: number; updatedCount: number; skippedCount: number }> {
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

    return {
      newCount: newTransactions.length,
      updatedCount: transactionsToUpdate.length,
      skippedCount,
    };
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
   * Save new transactions to the repository.
   */
  private async saveNewTransactions(
    transactions: Transaction[],
  ): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    // Sort by date ascending (oldest first) so newest transactions are at the bottom
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
   * Check if incoming transaction has bank-provided fields that are missing in existing.
   * Only checks fields that come from the bank (not user-entered fields).
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

  /**
   * Check if existing transaction is missing accountId (legacy bug fix).
   */
  private hasMissingAccountId(
    existing: Transaction,
    incoming: Transaction,
  ): boolean {
    return !existing.accountId && !!incoming.accountId;
  }

  /**
   * Check Group A fields (balance, operationAmount, counterpartyIban, hold).
   */
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

  /**
   * Check Group B fields (cashbackAmount, commissionRate, originalMcc, receiptId, invoiceId, counterEdrpou).
   */
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

  /**
   * Check other bank fields (counterpartyName, mcc, comment).
   */
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
   * User-entered fields (category, budget, tags, notes) are preserved via the spreadsheet
   * mapper - this method focuses on bank-provided fields.
   */
  private mergeTransactions(
    existing: Transaction,
    incoming: Transaction,
  ): Transaction {
    const mergedProps: TransactionProps = {
      // Identity
      externalId: existing.externalId,
      // Use incoming accountId (from bank API) if existing is empty (legacy bug)
      accountId: existing.accountId || incoming.accountId,
      // Core bank data (from incoming - latest from API)
      date: incoming.date,
      amount: incoming.amount,
      description: incoming.description,
      type: incoming.type,
      // Optional fields merged from both
      ...this.mergeOptionalBankFields(existing, incoming),
      // Comment: preserve existing if present, otherwise use incoming
      comment: existing.comment ?? incoming.comment,
    };

    return Transaction.create(mergedProps, existing.id);
  }

  /**
   * Merge optional bank fields: prefer incoming if present, fallback to existing.
   */
  private mergeOptionalBankFields(
    existing: Transaction,
    incoming: Transaction,
  ): Partial<TransactionProps> {
    return {
      ...this.mergeGroupAFields(existing, incoming),
      ...this.mergeGroupBAndOtherFields(existing, incoming),
    };
  }

  /**
   * Merge Group A fields (balance, operationAmount, counterpartyIban, hold).
   */
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

  /**
   * Merge Group B and other optional fields.
   */
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
