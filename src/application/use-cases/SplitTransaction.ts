import {
  SplitAmountExceedsOriginalError,
  SplitAmountMustBePositiveError,
  SplitRemainderMustBePositiveError,
  TransactionCannotBeSplitError,
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
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface SplitPartDTO {
  amount: number;
  description: string | null;
  categoryId: number | null;
  budgetId: number | null;
  notes: string | null;
}

export interface SplitTransactionRequestDTO {
  transactionId: number;
  parts: SplitPartDTO[];
}

export interface SplitTransactionResponseDTO {
  sourceTransactionId: number;
  splitTransactionIds: number[];
}

@injectable()
export class SplitTransactionUseCase extends UseCase<
  SplitTransactionRequestDTO,
  SplitTransactionResponseDTO
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
    request: SplitTransactionRequestDTO,
  ): Promise<SplitTransactionResponseDTO> {
    const sourceRecord = await this.loadAndValidateSource(
      request.transactionId,
    );

    const partsInMinorUnits = this.convertAndValidateAmounts(
      request.parts,
      sourceRecord.amount,
    );

    const splitSum = partsInMinorUnits.reduce(
      (sum, part) => sum + part.amount,
      0,
    );

    await this.reduceSourceAmount(
      sourceRecord.id,
      sourceRecord.amount,
      splitSum,
    );

    const splitRecords = await this.createSplitRecords(
      sourceRecord.id,
      request.parts,
      partsInMinorUnits,
    );

    await this.linkBankTransactions(sourceRecord.id, splitRecords);

    return {
      sourceTransactionId: sourceRecord.id,
      splitTransactionIds: splitRecords.map((record) => record.id),
    };
  }

  private async loadAndValidateSource(
    transactionId: number,
  ): Promise<TransactionRecord> {
    const record =
      await this.transactionRepository.findRecordById(transactionId);
    if (!record) {
      throw new TransactionNotFoundError(transactionId);
    }
    if (record.type === 'transfer') {
      throw new TransactionCannotBeSplitError(transactionId);
    }
    return record;
  }

  private convertAndValidateAmounts(
    parts: SplitPartDTO[],
    sourceAmount: number,
  ): Array<{ amount: number }> {
    const partsInMinorUnits = parts.map((part) => ({
      amount: Math.round(part.amount * 100),
    }));

    for (const part of partsInMinorUnits) {
      if (part.amount <= 0) {
        throw new SplitAmountMustBePositiveError(part.amount);
      }
    }

    const splitSum = partsInMinorUnits.reduce(
      (sum, part) => sum + part.amount,
      0,
    );

    if (splitSum >= sourceAmount) {
      throw new SplitAmountExceedsOriginalError(splitSum, sourceAmount);
    }

    const remainder = sourceAmount - splitSum;
    if (remainder <= 0) {
      throw new SplitRemainderMustBePositiveError(remainder, sourceAmount);
    }

    return partsInMinorUnits;
  }

  private async reduceSourceAmount(
    sourceId: number,
    sourceAmount: number,
    splitSum: number,
  ): Promise<void> {
    const newSourceAmount = sourceAmount - splitSum;
    await this.transactionRepository.updateTransactionAmount(
      sourceId,
      newSourceAmount,
    );
  }

  private async createSplitRecords(
    sourceTransactionId: number,
    parts: SplitPartDTO[],
    partsInMinorUnits: Array<{ amount: number }>,
  ): Promise<TransactionRecord[]> {
    const records: TransactionRecord[] = [];

    for (const [index, part] of parts.entries()) {
      const minorUnits = partsInMinorUnits[index];
      if (minorUnits) {
        const record = await this.transactionRepository.createSplitRecord({
          sourceTransactionId,
          amount: minorUnits.amount,
          description: part.description,
          categoryId: part.categoryId,
          budgetId: part.budgetId,
          notes: part.notes,
        });

        records.push(record);
      }
    }

    return records;
  }

  private async linkBankTransactions(
    sourceTransactionId: number,
    splitRecords: TransactionRecord[],
  ): Promise<void> {
    const bankTransactions =
      await this.bankTransactionRepository.findByTransactionId(
        sourceTransactionId,
      );

    if (bankTransactions.length === 0) {
      return;
    }

    const links: Array<{ transactionId: number; bankTransactionId: number }> =
      [];

    for (const splitRecord of splitRecords) {
      for (const bankTx of bankTransactions) {
        links.push({
          transactionId: splitRecord.id,
          bankTransactionId: bankTx.id,
        });
      }
    }

    await this.bankTransactionRepository.linkTransactionSources(links);
  }
}
