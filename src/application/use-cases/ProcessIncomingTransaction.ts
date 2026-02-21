import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { TransactionSyncService } from '@application/services/TransactionSyncService.ts';
import { EnqueueCategorizationUseCase } from '@application/use-cases/EnqueueCategorization.ts';
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
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
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
 * 5. Enqueuing the transaction for async categorization via Pub/Sub
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
    transactionRepository: TransactionRepository,
    @inject(BANK_TRANSACTION_REPOSITORY_TOKEN)
    bankTransactionRepository: BankTransactionRepository,
    private enqueueCategorization: EnqueueCategorizationUseCase,
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
      const deletedIds = await this.transactionSyncService.detectReturnings(
        [savedTransaction],
        account.dbId,
      );

      // If full refund deleted the transaction, skip all further processing
      if (
        savedTransaction.dbId !== null &&
        deletedIds.has(savedTransaction.dbId)
      ) {
        const newBalance = this.reconstructBalance(input);
        await this.accountRepository.updateBalance(
          account.externalId,
          newBalance,
        );
        return this.createSavedResult(transactionExternalId);
      }

      await this.transactionSyncService.detectFeeSplits(
        [savedTransaction],
        account.dbId,
      );

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

    await this.enqueueCategorizationSafely(savedTransaction);

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
    const amount = Money.create(Math.abs(txData.amount), currency);

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

  /**
   * Enqueue transaction for async categorization via Pub/Sub.
   * Failures are logged but do not prevent the transaction from being processed.
   */
  private async enqueueCategorizationSafely(
    transaction: Transaction,
  ): Promise<void> {
    const dbId = transaction.dbId;
    if (dbId === null) {
      this.logger.error('Cannot enqueue categorization without database ID', {
        externalId: transaction.externalId,
      });
      return;
    }

    try {
      const result = await this.enqueueCategorization.execute({
        transactionDbId: dbId,
      });
      this.logger.info('Categorization enqueued', {
        externalId: transaction.externalId,
        messageId: result.messageId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to enqueue categorization', {
        externalId: transaction.externalId,
        error: errorMessage,
      });
    }
  }
}
