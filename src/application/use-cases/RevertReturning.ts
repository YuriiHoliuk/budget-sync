import type { BankTransaction } from '@domain/entities/BankTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  NoReturningBankTransactionsError,
  TransactionIsTransferError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  BANK_TRANSACTION_REPOSITORY_TOKEN,
  type BankTransactionRepository,
} from '@domain/repositories/BankTransactionRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface RevertReturningRequestDTO {
  transactionId: number;
}

export interface RevertReturningResultDTO {
  originalTransactionId: number;
  createdTransactionIds: number[];
}

@injectable()
export class RevertReturningUseCase extends UseCase<
  RevertReturningRequestDTO,
  RevertReturningResultDTO
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(BANK_TRANSACTION_REPOSITORY_TOKEN)
    private readonly bankTransactionRepository: BankTransactionRepository,
  ) {
    super();
  }

  async execute(
    request: RevertReturningRequestDTO,
  ): Promise<RevertReturningResultDTO> {
    const record = await this.loadAndValidateTransaction(request.transactionId);

    const bankTxs = await this.bankTransactionRepository.findByTransactionId(
      request.transactionId,
    );

    const survivingType = record.type;
    const foreignBankTxs = bankTxs.filter((bankTx) =>
      survivingType === 'debit' ? bankTx.isCredit : bankTx.isDebit,
    );

    if (foreignBankTxs.length === 0) {
      throw new NoReturningBankTransactionsError(request.transactionId);
    }

    const currency = Currency.fromCode(record.currency);
    let currentAmount = Math.abs(record.amount);
    const createdTransactionIds: number[] = [];
    const resurrectedType =
      survivingType === 'debit'
        ? TransactionType.CREDIT
        : TransactionType.DEBIT;

    for (const bankTx of foreignBankTxs) {
      const createdId = await this.revertSingleReturn(
        record.id,
        bankTx,
        currency,
        resurrectedType,
      );
      if (createdId !== null) {
        createdTransactionIds.push(createdId);
      }
      currentAmount += Math.abs(bankTx.amount.amount);
    }

    await this.transactionRepository.updateTransactionAmount(
      request.transactionId,
      currentAmount,
    );

    return {
      originalTransactionId: request.transactionId,
      createdTransactionIds,
    };
  }

  private async loadAndValidateTransaction(
    transactionId: number,
  ): Promise<TransactionRecord> {
    const record =
      await this.transactionRepository.findRecordById(transactionId);
    if (!record) {
      throw new TransactionNotFoundError(transactionId);
    }
    if (record.type === 'transfer') {
      throw new TransactionIsTransferError(transactionId);
    }
    return record;
  }

  private async revertSingleReturn(
    survivingTransactionId: number,
    foreignBankTx: BankTransaction,
    currency: Currency,
    resurrectedType: TransactionType,
  ): Promise<number | null> {
    await this.bankTransactionRepository.unlinkTransactionSource(
      survivingTransactionId,
      foreignBankTx.id,
    );

    await this.bankTransactionRepository.deleteReturnsByReturningBankTransactionId(
      foreignBankTx.id,
    );

    const amount = Money.create(
      Math.abs(foreignBankTx.amount.amount),
      currency,
    );

    const accountExternalId = foreignBankTx.accountExternalId;
    if (!accountExternalId) {
      throw new Error(
        `Cannot revert returning: bank transaction ${foreignBankTx.id} has no accountExternalId`,
      );
    }

    const newTransaction = Transaction.create({
      externalId: foreignBankTx.externalId,
      date: foreignBankTx.date,
      amount,
      description: foreignBankTx.bankDescription ?? '',
      type: resurrectedType,
      accountId: accountExternalId,
    });

    const savedTransaction =
      await this.transactionRepository.saveAndReturn(newTransaction);

    const savedDbId = savedTransaction.dbId;
    if (savedDbId !== null) {
      await this.bankTransactionRepository.linkTransactionSource(
        savedDbId,
        foreignBankTx.id,
      );
    }

    return savedDbId;
  }
}
