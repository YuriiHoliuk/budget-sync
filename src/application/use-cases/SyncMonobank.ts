import type { Account } from '@domain/entities/Account.ts';
import {
  Transaction,
  type TransactionProps,
} from '@domain/entities/Transaction.ts';
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
import { LOGGER_TOKEN, type Logger } from '@modules/logging';
import { inject, injectable } from 'tsyringe';
import { chunkDateRange, delay } from '../utils/index.ts';

export interface SyncMonobankResultDTO {
  accounts: {
    created: number;
    updated: number;
    unchanged: number;
  };
  transactions: {
    totalAccounts: number;
    syncedAccounts: number;
    newTransactions: number;
    updatedTransactions: number;
    skippedTransactions: number;
  };
  errors: string[];
}

export interface SyncMonobankOptions {
  requestDelayMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  earliestSyncDate?: Date;
  /** When true, forces sync from earliestSyncDate ignoring lastSyncTime */
  forceFromDate?: boolean;
  syncOverlapMs?: number;
}

const DEFAULT_REQUEST_DELAY_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 60000;
const DEFAULT_EARLIEST_SYNC_DATE = new Date('2026-01-01');
const DEFAULT_SYNC_OVERLAP_MS = 600000; // 10 minutes

@injectable()
export class SyncMonobankUseCase {
  constructor(
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(LOGGER_TOKEN) private logger: Logger,
  ) {}

  async execute(
    options: SyncMonobankOptions = {},
  ): Promise<SyncMonobankResultDTO> {
    this.logger.info('Starting Monobank sync');
    this.logger.debug('monobank', 'Sync options', { options });

    const config = this.buildConfig(options);
    const result = this.createEmptyResult();

    await this.syncAccounts(result);
    await this.syncTransactions(config, result);

    this.logger.info('Monobank sync completed', {
      accounts: result.accounts,
      transactions: result.transactions,
      errors: result.errors,
    });

    return result;
  }

  private buildConfig(options: SyncMonobankOptions): Required<
    Omit<SyncMonobankOptions, 'earliestSyncDate' | 'forceFromDate'>
  > & {
    earliestSyncDate: Date;
    forceFromDate: boolean;
  } {
    return {
      requestDelayMs: options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialBackoffMs: options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS,
      earliestSyncDate: options.earliestSyncDate ?? DEFAULT_EARLIEST_SYNC_DATE,
      forceFromDate: options.forceFromDate ?? false,
      syncOverlapMs: options.syncOverlapMs ?? DEFAULT_SYNC_OVERLAP_MS,
    };
  }

  private createEmptyResult(): SyncMonobankResultDTO {
    return {
      accounts: {
        created: 0,
        updated: 0,
        unchanged: 0,
      },
      transactions: {
        totalAccounts: 0,
        syncedAccounts: 0,
        newTransactions: 0,
        updatedTransactions: 0,
        skippedTransactions: 0,
      },
      errors: [],
    };
  }

  private async syncAccounts(result: SyncMonobankResultDTO): Promise<void> {
    this.logger.info('Syncing accounts from Monobank');

    let bankAccounts: Account[];
    try {
      bankAccounts = await this.bankGateway.getAccounts();
      this.logger.debug(
        'monobank',
        `Fetched ${bankAccounts.length} accounts from bank`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorText = `Failed to fetch accounts from bank: ${errorMessage}`;
      this.logger.error(errorText, { error });
      result.errors.push(errorText);
      return;
    }

    for (const incomingAccount of bankAccounts) {
      try {
        await this.processAccount(incomingAccount, result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorText = `Failed to process account ${incomingAccount.externalId}: ${errorMessage}`;
        this.logger.error(errorText, {
          error,
          accountExternalId: incomingAccount.externalId,
        });
        result.errors.push(errorText);
      }
    }

    this.logger.info('Accounts sync completed', {
      created: result.accounts.created,
      updated: result.accounts.updated,
      unchanged: result.accounts.unchanged,
    });
  }

  private async processAccount(
    incomingAccount: Account,
    result: SyncMonobankResultDTO,
  ): Promise<void> {
    const existingAccount = await this.findExistingAccount(incomingAccount);

    if (existingAccount) {
      if (this.hasAccountChanged(existingAccount, incomingAccount)) {
        await this.accountRepository.update(incomingAccount);
        result.accounts.updated++;
        this.logger.debug('sync', 'Account updated', {
          externalId: incomingAccount.externalId,
          name: incomingAccount.name,
        });
      } else {
        result.accounts.unchanged++;
        this.logger.debug('sync', 'Account unchanged', {
          externalId: incomingAccount.externalId,
          name: incomingAccount.name,
        });
      }
    } else {
      await this.accountRepository.save(incomingAccount);
      result.accounts.created++;
      this.logger.debug('sync', 'Account created', {
        externalId: incomingAccount.externalId,
        name: incomingAccount.name,
      });
    }
  }

  private async findExistingAccount(
    incomingAccount: Account,
  ): Promise<Account | null> {
    const accountByExternalId = await this.accountRepository.findByExternalId(
      incomingAccount.externalId,
    );

    if (accountByExternalId) {
      return accountByExternalId;
    }

    if (incomingAccount.iban) {
      return this.accountRepository.findByIban(incomingAccount.iban);
    }

    return null;
  }

  private hasAccountChanged(
    existingAccount: Account,
    incomingAccount: Account,
  ): boolean {
    if (!existingAccount.balance.equals(incomingAccount.balance)) {
      return true;
    }

    if (existingAccount.name !== incomingAccount.name) {
      return true;
    }

    if (existingAccount.type !== incomingAccount.type) {
      return true;
    }

    if (existingAccount.iban !== incomingAccount.iban) {
      return true;
    }

    const existingMaskedPan = existingAccount.maskedPan ?? [];
    const incomingMaskedPan = incomingAccount.maskedPan ?? [];

    if (existingMaskedPan.length !== incomingMaskedPan.length) {
      return true;
    }

    for (let panIndex = 0; panIndex < existingMaskedPan.length; panIndex++) {
      if (existingMaskedPan[panIndex] !== incomingMaskedPan[panIndex]) {
        return true;
      }
    }

    return false;
  }

  private async syncTransactions(
    config: ReturnType<typeof this.buildConfig>,
    result: SyncMonobankResultDTO,
  ): Promise<void> {
    this.logger.info('Syncing transactions from Monobank');

    const accounts = await this.fetchMonobankAccountsOrReportError(result);
    if (!accounts) {
      return;
    }

    result.transactions.totalAccounts = accounts.length;
    this.logger.debug(
      'monobank',
      `Found ${accounts.length} Monobank accounts to sync`,
    );

    await this.syncAllAccounts(accounts, config, result);

    this.logger.info('Transactions sync completed', {
      totalAccounts: result.transactions.totalAccounts,
      syncedAccounts: result.transactions.syncedAccounts,
      newTransactions: result.transactions.newTransactions,
      skippedTransactions: result.transactions.skippedTransactions,
    });
  }

  private async fetchMonobankAccountsOrReportError(
    result: SyncMonobankResultDTO,
  ): Promise<Account[] | null> {
    try {
      return await this.accountRepository.findByBank('monobank');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorText = `Failed to fetch accounts: ${errorMessage}`;
      this.logger.error(errorText, { error });
      result.errors.push(errorText);
      return null;
    }
  }

  private async syncAllAccounts(
    accounts: Account[],
    config: ReturnType<typeof this.buildConfig>,
    result: SyncMonobankResultDTO,
  ): Promise<void> {
    let isFirstRequest = true;

    for (const account of accounts) {
      this.logger.info(`Syncing transactions for account: ${account.name}`, {
        externalId: account.externalId,
      });

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
        config.forceFromDate,
      );

      this.logger.debug('monobank', 'Syncing account transactions', {
        accountExternalId: account.externalId,
        accountName: account.name,
        syncFrom: syncFrom.toISOString(),
        syncTo: now.toISOString(),
      });

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

      this.logger.debug('monobank', 'Account transactions synced', {
        accountExternalId: account.externalId,
        accountName: account.name,
        newTransactions: newCount,
        updatedTransactions: updatedCount,
        skippedTransactions: skippedCount,
      });

      return {
        synced: true,
        newTransactions: newCount,
        updatedTransactions: updatedCount,
        skippedTransactions: skippedCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorText = `Failed to sync account ${account.externalId}: ${errorMessage}`;
      this.logger.error(errorText, {
        error,
        accountExternalId: account.externalId,
        accountName: account.name,
      });
      return {
        synced: false,
        newTransactions: 0,
        updatedTransactions: 0,
        skippedTransactions: 0,
        error: errorText,
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

    this.logger.debug('monobank', `Processing ${chunks.length} date chunks`, {
      accountExternalId,
      chunks: chunks.map((chunk) => ({
        from: chunk.from.toISOString(),
        to: chunk.to.toISOString(),
      })),
    });

    for (const chunk of chunks) {
      if (shouldDelay) {
        this.logger.debug(
          'monobank',
          `Delaying ${config.requestDelayMs}ms for rate limiting`,
        );
        await delay(config.requestDelayMs);
      }
      shouldDelay = true;

      this.logger.debug('monobank', 'Fetching chunk transactions', {
        accountExternalId,
        from: chunk.from.toISOString(),
        to: chunk.to.toISOString(),
      });

      const transactions = await this.fetchTransactionsWithRetry(
        accountExternalId,
        chunk.from,
        chunk.to,
        config.maxRetries,
        config.initialBackoffMs,
      );

      const { newCount, updatedCount, skippedCount } =
        await this.processTransactions(transactions);

      this.logger.debug('monobank', 'Chunk processed', {
        accountExternalId,
        from: chunk.from.toISOString(),
        to: chunk.to.toISOString(),
        newTransactions: newCount,
        updatedTransactions: updatedCount,
        skippedTransactions: skippedCount,
      });

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
    result: SyncMonobankResultDTO,
    accountResult: Awaited<ReturnType<typeof this.syncSingleAccount>>,
  ): void {
    if (accountResult.synced) {
      result.transactions.syncedAccounts++;
    }
    result.transactions.newTransactions += accountResult.newTransactions;
    result.transactions.updatedTransactions +=
      accountResult.updatedTransactions;
    result.transactions.skippedTransactions +=
      accountResult.skippedTransactions;
    if (accountResult.error) {
      result.errors.push(accountResult.error);
    }
  }

  private calculateSyncFrom(
    lastSyncTime: number | undefined,
    earliestSyncDate: Date,
    syncOverlapMs: number,
    forceFromDate: boolean,
  ): Date {
    // When forceFromDate is true, always use earliestSyncDate (for backfill)
    if (forceFromDate || lastSyncTime === undefined) {
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
          this.logger.warn(
            `Rate limit hit, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`,
            {
              accountId,
              attempt: attempt + 1,
              maxRetries,
              backoffMs,
            },
          );
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
      this.hasNewGroupAFields(existing, incoming) ||
      this.hasNewGroupBFields(existing, incoming) ||
      this.hasNewOtherBankFields(existing, incoming)
    );
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
      // Identity (from existing)
      externalId: existing.externalId,
      accountId: existing.accountId,
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
