import { TransactionSyncService } from '@application/services/TransactionSyncService.ts';
import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
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
  BANK_TRANSACTION_REPOSITORY_TOKEN,
  type BankTransactionRepository,
} from '@domain/repositories/BankTransactionRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { TransactionProcessingService } from '@domain/services/TransactionProcessingService.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
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
  private readonly transactionSyncService: TransactionSyncService;

  constructor(
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    transactionRepository: TransactionRepository,
    @inject(BANK_TRANSACTION_REPOSITORY_TOKEN)
    bankTransactionRepository: BankTransactionRepository,
    @inject(LOGGER_TOKEN) logger: Logger,
  ) {
    super();
    this.transactionSyncService = new TransactionSyncService(
      transactionRepository,
      bankTransactionRepository,
      new TransactionProcessingService(),
      logger,
    );
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

    const allActiveAccounts = await this.accountRepository.findActive();
    const ownAccountIds = allActiveAccounts
      .map((account) => account.dbId)
      .filter((dbId): dbId is number => dbId !== null);

    result.totalAccounts = accounts.length;
    await this.syncAllAccounts(accounts, config, result, ownAccountIds);

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
    ownAccountIds: number[],
  ): Promise<void> {
    let isFirstRequest = true;

    for (const account of accounts) {
      const syncResult = await this.syncSingleAccount(
        account,
        config,
        isFirstRequest,
        ownAccountIds,
      );
      isFirstRequest = false;

      this.mergeAccountResult(result, syncResult);
    }
  }

  private async syncSingleAccount(
    account: Account,
    config: ReturnType<typeof this.buildConfig>,
    isFirstRequest: boolean,
    ownAccountIds: number[],
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

      const accountDbId = account.dbId;

      const { newCount, updatedCount, skippedCount } =
        await this.syncAccountChunks(
          account.externalId,
          syncFrom,
          now,
          config,
          isFirstRequest,
          accountDbId,
          ownAccountIds,
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
    accountDbId: number | null,
    ownAccountIds: number[],
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

      const { newCount, updatedCount, skippedCount, savedTransactions } =
        await this.transactionSyncService.processBatch(
          transactions,
          accountDbId,
        );

      if (accountDbId !== null && savedTransactions.length > 0) {
        await this.transactionSyncService.detectTransfers(
          savedTransactions,
          accountDbId,
          ownAccountIds,
        );
      }

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
}
