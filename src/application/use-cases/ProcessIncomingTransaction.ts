import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';

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
 * 4. Saving the transaction
 * 5. Updating account balance (using balance reported by the bank)
 *
 * Throws on failure - the caller (job/queue processor) handles retry logic.
 */
@injectable()
export class ProcessIncomingTransactionUseCase {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
  ) {}

  async execute(
    input: QueuedWebhookTransactionDTO,
  ): Promise<ProcessIncomingTransactionResultDTO> {
    const account = await this.findAccountOrThrow(input.accountExternalId);

    const transactionExternalId = input.transaction.externalId;
    const isDuplicate = await this.isTransactionDuplicate(
      transactionExternalId,
    );
    if (isDuplicate) {
      return this.createSkippedResult(transactionExternalId);
    }

    const transaction = this.reconstructTransaction(input);
    await this.transactionRepository.save(transaction);

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

  private async isTransactionDuplicate(externalId: string): Promise<boolean> {
    const existingTransaction =
      await this.transactionRepository.findByExternalId(externalId);
    return existingTransaction !== null;
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
    });
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
}
