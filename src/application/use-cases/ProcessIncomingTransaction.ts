import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { TransactionSyncService } from '@application/services/TransactionSyncService.ts';
import { CategorizeTransactionUseCase } from '@application/use-cases/CategorizeTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
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
import {
  CategorizationStatus,
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { LLMRateLimitError } from '@modules/llm/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

/**
 * Result DTO indicating the outcome of processing.
 */
export interface ProcessIncomingTransactionResultDTO {
  /** Whether the transaction was saved (false if skipped due to deduplication) */
  saved: boolean;
  /** External ID of the transaction */
  transactionExternalId: string;
}

/**
 * Use case for processing a single incoming transaction from the queue.
 *
 * This use case handles:
 * 1. Reconstructing domain entities from the queued primitive data
 * 2. Finding the account by external ID
 * 3. Deduplication - skipping if transaction already exists
 * 4. Saving the transaction and bank transaction record
 * 5. Categorizing the transaction via LLM
 * 6. Updating account balance (using balance reported by the bank)
 *
 * Throws on failure - the caller (job/queue processor) handles retry logic.
 */
@injectable()
export class ProcessIncomingTransactionUseCase extends UseCase<
  QueuedWebhookTransactionDTO,
  ProcessIncomingTransactionResultDTO
> {
  private readonly transactionSyncService: TransactionSyncService;

  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(BANK_TRANSACTION_REPOSITORY_TOKEN)
    bankTransactionRepository: BankTransactionRepository,
    private categorizeTransaction: CategorizeTransactionUseCase,
    @inject(LOGGER_TOKEN)
    private logger: Logger,
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
    input: QueuedWebhookTransactionDTO,
  ): Promise<ProcessIncomingTransactionResultDTO> {
    const account = await this.findAccountOrThrow(input.accountExternalId);

    const transactionExternalId = input.transaction.externalId;
    const transaction = this.reconstructTransaction(input);

    const savedTransaction = await this.transactionSyncService.processSingle(
      transaction,
      account.dbId,
    );

    if (!savedTransaction) {
      return this.createSkippedResult(transactionExternalId);
    }

    if (account.dbId !== null) {
      const allActiveAccounts = await this.accountRepository.findActive();
      const ownAccountIds = allActiveAccounts
        .map((activeAccount) => activeAccount.dbId)
        .filter((dbId): dbId is number => dbId !== null);

      await this.transactionSyncService.detectTransfers(
        [savedTransaction],
        account.dbId,
        ownAccountIds,
      );
    }

    await this.categorizeTransactionSafely(savedTransaction);

    const newBalance = this.reconstructBalance(input);
    await this.accountRepository.updateBalance(account.externalId, newBalance);

    return this.createSavedResult(transactionExternalId);
  }

  private async findAccountOrThrow(accountExternalId: string) {
    const account =
      await this.accountRepository.findByExternalId(accountExternalId);
    if (!account) {
      throw new AccountNotFoundError(accountExternalId, 'externalId');
    }
    return account;
  }

  /**
   * Reconstruct a Transaction entity from the queued primitive data.
   */
  private reconstructTransaction(
    input: QueuedWebhookTransactionDTO,
  ): Transaction {
    const { transaction: txData, accountExternalId } = input;

    const currency = Currency.fromNumericCode(txData.currencyCode);
    const amount = Money.create(txData.amount, currency);

    const operationCurrency = Currency.fromNumericCode(
      txData.operationCurrencyCode,
    );
    const operationAmount = Money.create(
      txData.operationAmount,
      operationCurrency,
    );

    const balanceCurrency = Currency.fromNumericCode(txData.currencyCode);
    const balance = Money.create(txData.balanceAmount, balanceCurrency);

    const transactionType =
      txData.type === 'CREDIT' ? TransactionType.CREDIT : TransactionType.DEBIT;

    return Transaction.create({
      externalId: txData.externalId,
      date: new Date(txData.date),
      amount,
      operationAmount,
      description: txData.description,
      type: transactionType,
      accountId: accountExternalId,
      mcc: txData.mcc,
      comment: txData.comment,
      balance,
      counterpartyName: txData.counterpartyName,
      counterpartyIban: txData.counterpartyIban,
      hold: txData.hold,
      cashbackAmount: this.parseOptionalMoney(txData.cashbackAmount, currency),
      commissionRate: this.parseOptionalMoney(txData.commissionRate, currency),
      originalMcc: txData.originalMcc,
      receiptId: txData.receiptId,
      invoiceId: txData.invoiceId,
      counterEdrpou: txData.counterEdrpou,
    });
  }

  /**
   * Parse optional money amount from minor units.
   */
  private parseOptionalMoney(
    minorUnits: number | undefined,
    currency: Currency,
  ): Money | undefined {
    if (minorUnits === undefined || minorUnits === 0) {
      return undefined;
    }
    return Money.create(minorUnits, currency);
  }

  /**
   * Reconstruct the new balance Money object from the queued primitive data.
   */
  private reconstructBalance(input: QueuedWebhookTransactionDTO): Money {
    const currency = Currency.fromNumericCode(input.newBalanceCurrencyCode);
    return Money.create(input.newBalanceAmount, currency);
  }

  private createSkippedResult(
    transactionExternalId: string,
  ): ProcessIncomingTransactionResultDTO {
    return {
      saved: false,
      transactionExternalId,
    };
  }

  private createSavedResult(
    transactionExternalId: string,
  ): ProcessIncomingTransactionResultDTO {
    return {
      saved: true,
      transactionExternalId,
    };
  }

  private async categorizeTransactionSafely(
    transaction: Transaction,
  ): Promise<void> {
    const dbId = transaction.dbId;
    if (dbId === null) {
      this.logger.error('Cannot categorize transaction without database ID', {
        externalId: transaction.externalId,
      });
      return;
    }

    try {
      await this.categorizeWithRetry(dbId);
      this.logger.info('Transaction categorized', {
        externalId: transaction.externalId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to categorize transaction', {
        externalId: transaction.externalId,
        error: errorMessage,
      });

      await this.markCategorizationFailed(dbId, transaction.externalId);
    }
  }

  private async categorizeWithRetry(dbId: number): Promise<void> {
    try {
      await this.categorizeTransaction.execute({
        transactionDbId: dbId,
      });
    } catch (error) {
      if (error instanceof LLMRateLimitError) {
        this.logger.warn('Rate limited, retrying categorization in 60s', {
          dbId,
        });
        await this.sleep(60_000);
        await this.categorizeTransaction.execute({
          transactionDbId: dbId,
        });
        return;
      }
      throw error;
    }
  }

  private async markCategorizationFailed(
    dbId: number,
    externalId: string,
  ): Promise<void> {
    try {
      await this.transactionRepository.updateCategorization(dbId, {
        category: null,
        budget: null,
        categoryReason: null,
        budgetReason: null,
        status: CategorizationStatus.FAILED,
      });
    } catch (updateError) {
      this.logger.error('Failed to update categorization status to failed', {
        externalId,
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
