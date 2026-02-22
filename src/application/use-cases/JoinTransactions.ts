import {
  JoinTargetIsTransferError,
  JoinTransactionCannotBeSelfError,
  JoinTransactionsNotSiblingsError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface JoinTransactionsRequestDTO {
  targetTransactionId: number;
  sourceTransactionId: number;
}

export interface JoinTransactionsResponseDTO {
  targetTransactionId: number;
}

@injectable()
export class JoinTransactionsUseCase extends UseCase<
  JoinTransactionsRequestDTO,
  JoinTransactionsResponseDTO
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
  ) {
    super();
  }

  async execute(
    request: JoinTransactionsRequestDTO,
  ): Promise<JoinTransactionsResponseDTO> {
    this.validateDifferentIds(
      request.targetTransactionId,
      request.sourceTransactionId,
    );

    const targetRecord = await this.loadAndValidateTransaction(
      request.targetTransactionId,
    );
    const sourceRecord = await this.loadAndValidateTransaction(
      request.sourceTransactionId,
    );

    this.validateCompatibility(targetRecord, sourceRecord);
    await this.validateSiblings(targetRecord, sourceRecord);

    const newAmount = targetRecord.amount + sourceRecord.amount;
    await this.transactionRepository.updateTransactionAmount(
      targetRecord.id,
      newAmount,
    );
    await this.transactionRepository.deleteByDbId(sourceRecord.id);

    return { targetTransactionId: targetRecord.id };
  }

  private validateDifferentIds(targetId: number, sourceId: number): void {
    if (targetId === sourceId) {
      throw new JoinTransactionCannotBeSelfError(targetId);
    }
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
      throw new JoinTargetIsTransferError(transactionId);
    }
    return record;
  }

  private validateCompatibility(
    target: TransactionRecord,
    source: TransactionRecord,
  ): void {
    if (target.currency !== source.currency) {
      throw new Error(
        `Cannot join transactions with different currencies: ${target.currency} and ${source.currency}`,
      );
    }
    if (target.type !== source.type) {
      throw new Error(
        `Cannot join transactions with different types: ${target.type} and ${source.type}`,
      );
    }
  }

  private async validateSiblings(
    target: TransactionRecord,
    source: TransactionRecord,
  ): Promise<void> {
    const siblings = await this.transactionRepository.findSiblingTransactions(
      target.id,
    );
    const isSibling = siblings.some((sibling) => sibling.id === source.id);
    if (!isSibling) {
      throw new JoinTransactionsNotSiblingsError(source.id, target.id);
    }
  }
}
