import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
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
import { MonobankRateLimitError } from '@infrastructure/gateways/monobank/errors.ts';
import { inject, injectable } from 'tsyringe';
import { chunkDateRange, delay } from '../utils/index.ts';

export interface SyncTransactionsResultDTO {
  totalAccounts: number;
  syncedAccounts: number;
  newTransactions: number;
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
export class SyncTransactionsUseCase {
  constructor(
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
  ) {}

  async execute(
    options: SyncTransactionsOptions = {},
  ): Promise<SyncTransactionsResultDTO> {
    const requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const initialBackoffMs =
      options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    const earliestSyncDate =
      options.earliestSyncDate ?? DEFAULT_EARLIEST_SYNC_DATE;
    const syncOverlapMs = options.syncOverlapMs ?? DEFAULT_SYNC_OVERLAP_MS;

    const result: SyncTransactionsResultDTO = {
      totalAccounts: 0,
      syncedAccounts: 0,
      newTransactions: 0,
      skippedTransactions: 0,
      errors: [],
    };

    let accounts: Account[];
    try {
      accounts = await this.accountRepository.findByBank('monobank');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to fetch accounts: ${errorMessage}`);
      return result;
    }

    result.totalAccounts = accounts.length;

    let isFirstRequest = true;

    for (const account of accounts) {
      try {
        const now = new Date();
        const syncFrom = this.calculateSyncFrom(
          account.lastSyncTime,
          earliestSyncDate,
          syncOverlapMs,
        );

        const chunks = chunkDateRange(syncFrom, now, 31);

        for (const chunk of chunks) {
          if (!isFirstRequest) {
            await delay(requestDelayMs);
          }
          isFirstRequest = false;

          const transactions = await this.fetchTransactionsWithRetry(
            account.externalId,
            chunk.from,
            chunk.to,
            maxRetries,
            initialBackoffMs,
          );

          const { newCount, skippedCount } =
            await this.deduplicateAndSaveTransactions(transactions);

          result.newTransactions += newCount;
          result.skippedTransactions += skippedCount;
        }

        await this.accountRepository.updateLastSyncTime(
          account.id,
          now.getTime(),
        );
        result.syncedAccounts++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(
          `Failed to sync account ${account.externalId}: ${errorMessage}`,
        );
      }
    }

    return result;
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
        if (error instanceof MonobankRateLimitError && attempt < maxRetries) {
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

  private async deduplicateAndSaveTransactions(
    transactions: Transaction[],
  ): Promise<{ newCount: number; skippedCount: number }> {
    if (transactions.length === 0) {
      return { newCount: 0, skippedCount: 0 };
    }

    const externalIds = transactions.map(
      (transaction) => transaction.externalId,
    );
    const existingTransactions =
      await this.transactionRepository.findByExternalIds(externalIds);

    const newTransactions = transactions.filter(
      (transaction) => !existingTransactions.has(transaction.externalId),
    );

    if (newTransactions.length > 0) {
      // Sort by date ascending (oldest first) so newest transactions are at the bottom
      const sortedTransactions = [...newTransactions].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );
      await this.transactionRepository.saveMany(sortedTransactions);
    }

    return {
      newCount: newTransactions.length,
      skippedCount: transactions.length - newTransactions.length,
    };
  }
}
