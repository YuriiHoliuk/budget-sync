import type { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  AccountNotFoundError,
  CurrencyMismatchError,
  ManualTransactionNotAllowedError,
  TransactionAlreadyTransferError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { Money, TransactionType } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ConvertToTransferRequestDTO {
  transactionId: number;
  destinationAccountId: number;
}

export interface ConvertToTransferResponseDTO {
  sourceTransactionId: number;
  counterpartTransactionId: number;
}

@injectable()
export class ConvertToTransferUseCase extends UseCase<
  ConvertToTransferRequestDTO,
  ConvertToTransferResponseDTO
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(
    request: ConvertToTransferRequestDTO,
  ): Promise<ConvertToTransferResponseDTO> {
    const sourceRecord = await this.findAndValidateSourceTransaction(
      request.transactionId,
    );
    const destinationAccount = await this.findAndValidateDestinationAccount(
      request.destinationAccountId,
      sourceRecord.currency,
    );

    const counterpart = await this.createCounterpartTransaction(
      sourceRecord,
      destinationAccount,
    );

    await this.transactionRepository.updateRecordType(
      sourceRecord.id,
      'transfer',
    );

    const counterpartDbId = counterpart.dbId;
    if (counterpartDbId === null) {
      throw new Error('Counterpart transaction was not assigned a database ID');
    }

    await this.transactionRepository.updateRecordType(
      counterpartDbId,
      'transfer',
    );

    const { outgoingId, incomingId } = this.resolveTransferDirection(
      sourceRecord,
      counterpartDbId,
    );
    await this.transactionRepository.createTransferPair(outgoingId, incomingId);

    await this.updateDestinationBalance(
      destinationAccount,
      sourceRecord.type,
      sourceRecord.amount,
    );

    return {
      sourceTransactionId: sourceRecord.id,
      counterpartTransactionId: counterpartDbId,
    };
  }

  private async findAndValidateSourceTransaction(
    transactionId: number,
  ): Promise<TransactionRecord> {
    const record =
      await this.transactionRepository.findRecordById(transactionId);
    if (!record) {
      throw new TransactionNotFoundError(transactionId);
    }
    if (record.type === 'transfer') {
      throw new TransactionAlreadyTransferError(transactionId);
    }
    return record;
  }

  private async findAndValidateDestinationAccount(
    accountId: number,
    sourceCurrency: string,
  ): Promise<Account> {
    const account = await this.accountRepository.findByDbId(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId.toString(), 'id');
    }
    if (account.isSynced) {
      throw new ManualTransactionNotAllowedError(accountId);
    }
    if (account.isArchived) {
      throw new AccountNotFoundError(accountId.toString(), 'id');
    }
    if (account.currency.code !== sourceCurrency) {
      throw new CurrencyMismatchError(sourceCurrency, account.currency.code);
    }
    return account;
  }

  private createCounterpartTransaction(
    sourceRecord: TransactionRecord,
    destinationAccount: Account,
  ): Promise<Transaction> {
    const amount = Money.create(
      Math.abs(sourceRecord.amount),
      destinationAccount.currency,
    );

    const counterpart = Transaction.create({
      externalId: `transfer-counterpart-${sourceRecord.id}-${Date.now()}`,
      date: sourceRecord.date,
      amount,
      description: sourceRecord.bankDescription ?? 'Transfer',
      type: TransactionType.TRANSFER,
      accountId: destinationAccount.externalId,
    });

    return this.transactionRepository.saveAndReturn(counterpart);
  }

  private resolveTransferDirection(
    sourceRecord: TransactionRecord,
    counterpartDbId: number,
  ): { outgoingId: number; incomingId: number } {
    if (sourceRecord.type === 'debit') {
      return { outgoingId: sourceRecord.id, incomingId: counterpartDbId };
    }
    return { outgoingId: counterpartDbId, incomingId: sourceRecord.id };
  }

  private async updateDestinationBalance(
    destinationAccount: Account,
    sourceType: string,
    sourceAmount: number,
  ): Promise<void> {
    const absoluteAmount = Math.abs(sourceAmount);
    const transferAmount = Money.create(
      absoluteAmount,
      destinationAccount.currency,
    );

    const newBalance =
      sourceType === 'debit'
        ? destinationAccount.balance.add(transferAmount)
        : destinationAccount.balance.subtract(transferAmount);

    await this.accountRepository.updateBalance(
      destinationAccount.externalId,
      newBalance,
    );
  }
}
