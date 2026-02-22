import {
  CurrencyMismatchError,
  OriginalTransactionNotDebitError,
  ReturningAccountMismatchError,
  ReturningAmountExceedsOriginalError,
  ReturningTransactionNotCreditError,
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
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface MarkAsReturningRequestDTO {
  returningTransactionId: number;
  originalTransactionId: number;
}

export interface MarkAsReturningResponseDTO {
  type: 'partial' | 'full';
  originalTransactionId: number;
  returningAmount: number;
  originalAmount: number;
  newOriginalAmount: number | null;
}

@injectable()
export class MarkAsReturningUseCase extends UseCase<
  MarkAsReturningRequestDTO,
  MarkAsReturningResponseDTO
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
    request: MarkAsReturningRequestDTO,
  ): Promise<MarkAsReturningResponseDTO> {
    const returningRecord = await this.loadAndValidateReturning(
      request.returningTransactionId,
    );
    const originalRecord = await this.loadAndValidateOriginal(
      request.originalTransactionId,
    );

    this.validateCompatibility(returningRecord, originalRecord);

    const returningAmount = Math.abs(returningRecord.amount);
    const originalAmount = Math.abs(originalRecord.amount);

    if (returningAmount > originalAmount) {
      throw new ReturningAmountExceedsOriginalError(
        returningAmount,
        originalAmount,
      );
    }

    const isFullReturn = returningAmount === originalAmount;

    if (isFullReturn) {
      return this.processFullReturn(
        returningRecord,
        originalRecord,
        returningAmount,
        originalAmount,
      );
    }

    return this.processPartialReturn(
      returningRecord,
      originalRecord,
      returningAmount,
      originalAmount,
    );
  }

  private async loadAndValidateReturning(
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
    if (record.type !== 'credit') {
      throw new ReturningTransactionNotCreditError(transactionId);
    }
    return record;
  }

  private async loadAndValidateOriginal(
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
    if (record.type !== 'debit') {
      throw new OriginalTransactionNotDebitError(transactionId);
    }
    return record;
  }

  private validateCompatibility(
    returning: TransactionRecord,
    original: TransactionRecord,
  ): void {
    if (returning.currency !== original.currency) {
      throw new CurrencyMismatchError(returning.currency, original.currency);
    }
    if (returning.accountId !== original.accountId) {
      throw new ReturningAccountMismatchError(
        returning.accountId ?? 0,
        original.accountId ?? 0,
      );
    }
  }

  private async processFullReturn(
    returningRecord: TransactionRecord,
    originalRecord: TransactionRecord,
    returningAmount: number,
    originalAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    await this.recordBankTransactionReturns(
      originalRecord.id,
      returningRecord.id,
    );

    await this.transactionRepository.delete(returningRecord.externalId ?? '');
    await this.transactionRepository.delete(originalRecord.externalId ?? '');

    return {
      type: 'full',
      originalTransactionId: originalRecord.id,
      returningAmount,
      originalAmount,
      newOriginalAmount: null,
    };
  }

  private async processPartialReturn(
    returningRecord: TransactionRecord,
    originalRecord: TransactionRecord,
    returningAmount: number,
    originalAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    const newOriginalAmount = originalAmount - returningAmount;

    await this.transactionRepository.updateTransactionAmount(
      originalRecord.id,
      newOriginalAmount,
    );

    await this.recordBankTransactionReturns(
      originalRecord.id,
      returningRecord.id,
    );

    const returningBankTxs =
      await this.bankTransactionRepository.findByTransactionId(
        returningRecord.id,
      );

    for (const bankTx of returningBankTxs) {
      await this.bankTransactionRepository.linkTransactionSource(
        originalRecord.id,
        bankTx.id,
      );
    }

    await this.transactionRepository.delete(returningRecord.externalId ?? '');

    return {
      type: 'partial',
      originalTransactionId: originalRecord.id,
      returningAmount,
      originalAmount,
      newOriginalAmount,
    };
  }

  private async recordBankTransactionReturns(
    originalTransactionId: number,
    returningTransactionId: number,
  ): Promise<void> {
    const [originalBankTxs, returningBankTxs] = await Promise.all([
      this.bankTransactionRepository.findByTransactionId(originalTransactionId),
      this.bankTransactionRepository.findByTransactionId(
        returningTransactionId,
      ),
    ]);

    const firstDebitBankTx = originalBankTxs.find((bankTx) => bankTx.isDebit);
    if (!firstDebitBankTx) {
      return;
    }

    for (const returningBankTx of returningBankTxs) {
      await this.bankTransactionRepository.saveReturn({
        originalBankTransactionId: firstDebitBankTx.id,
        returningBankTransactionId: returningBankTx.id,
        amount: Math.abs(returningBankTx.amount.amount),
      });
    }
  }
}
