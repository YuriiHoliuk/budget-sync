import type { BankTransaction } from '@domain/entities/BankTransaction.ts';
import {
  CurrencyMismatchError,
  OriginalTransactionNotDebitError,
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
  creditTransactionIds: number[];
  debitTransactionIds: number[];
}

export type MarkAsReturningResultType =
  | 'full_cancel'
  | 'debit_reduced'
  | 'credit_reduced';

export interface MarkAsReturningResponseDTO {
  type: MarkAsReturningResultType;
  survivingTransactionId: number | null;
  newSurvivingAmount: number | null;
  totalDebitAmount: number;
  totalCreditAmount: number;
}

/**
 * Thrown when the anchor transaction's amount is smaller than the sum of the
 * many-side transactions. Example: a single salary credit cannot absorb a set
 * of expenses that sum to more than the salary itself — we have no unambiguous
 * way to decide which of the many expenses to partially reduce.
 */
export class AnchorAmountInsufficientError extends Error {
  constructor(anchorAmount: number, manySideSum: number) {
    super(
      `Anchor amount (${anchorAmount}) is less than the sum of selected transactions (${manySideSum})`,
    );
    this.name = 'AnchorAmountInsufficientError';
  }
}

/**
 * Thrown when both sides of the pairing have more than one transaction.
 * Many-to-many pairings are not supported because reducing multiple
 * transactions on the surviving side has no single "right" allocation.
 */
export class MultiOnBothSidesUnsupportedError extends Error {
  constructor(creditCount: number, debitCount: number) {
    super(
      `Both sides cannot have multiple transactions (credits: ${creditCount}, debits: ${debitCount}). Exactly one side must be a single anchor transaction.`,
    );
    this.name = 'MultiOnBothSidesUnsupportedError';
  }
}

export class EmptyReturningSideError extends Error {
  constructor(side: 'credit' | 'debit') {
    super(`At least one ${side} transaction is required`);
    this.name = 'EmptyReturningSideError';
  }
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
    this.validateInputShape(request);

    const credits = await this.loadAndValidateCredits(
      request.creditTransactionIds,
    );
    const debits = await this.loadAndValidateDebits(
      request.debitTransactionIds,
    );

    this.validateCurrency(credits, debits);

    const totalCreditAmount = sumAbs(credits);
    const totalDebitAmount = sumAbs(debits);

    this.validateAnchorCapacity(
      credits,
      debits,
      totalCreditAmount,
      totalDebitAmount,
    );

    const outcome = this.classifyOutcome(
      credits,
      debits,
      totalCreditAmount,
      totalDebitAmount,
    );

    return this.dispatchOutcome(
      outcome,
      credits,
      debits,
      totalCreditAmount,
      totalDebitAmount,
    );
  }

  private validateInputShape(request: MarkAsReturningRequestDTO): void {
    if (request.creditTransactionIds.length === 0) {
      throw new EmptyReturningSideError('credit');
    }
    if (request.debitTransactionIds.length === 0) {
      throw new EmptyReturningSideError('debit');
    }
    if (
      request.creditTransactionIds.length > 1 &&
      request.debitTransactionIds.length > 1
    ) {
      throw new MultiOnBothSidesUnsupportedError(
        request.creditTransactionIds.length,
        request.debitTransactionIds.length,
      );
    }
  }

  private validateAnchorCapacity(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): void {
    const isCreditAnchor = credits.length === 1 && debits.length > 1;
    const isDebitAnchor = debits.length === 1 && credits.length > 1;
    if (isCreditAnchor && totalDebitAmount > totalCreditAmount) {
      throw new AnchorAmountInsufficientError(
        totalCreditAmount,
        totalDebitAmount,
      );
    }
    if (isDebitAnchor && totalCreditAmount > totalDebitAmount) {
      throw new AnchorAmountInsufficientError(
        totalDebitAmount,
        totalCreditAmount,
      );
    }
  }

  private classifyOutcome(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): MarkAsReturningResultType {
    if (totalCreditAmount === totalDebitAmount) {
      return 'full_cancel';
    }
    const isCreditAnchor = credits.length === 1 && debits.length > 1;
    if (isCreditAnchor) {
      return 'credit_reduced';
    }
    const isDebitAnchor = debits.length === 1 && credits.length > 1;
    if (isDebitAnchor) {
      return 'debit_reduced';
    }
    return totalCreditAmount < totalDebitAmount
      ? 'debit_reduced'
      : 'credit_reduced';
  }

  private dispatchOutcome(
    outcome: MarkAsReturningResultType,
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    if (outcome === 'full_cancel') {
      return this.processFullCancel(
        credits,
        debits,
        totalCreditAmount,
        totalDebitAmount,
      );
    }
    if (outcome === 'debit_reduced') {
      return this.processDebitReduced(
        credits,
        debits,
        totalCreditAmount,
        totalDebitAmount,
      );
    }
    return this.processCreditReduced(
      credits,
      debits,
      totalCreditAmount,
      totalDebitAmount,
    );
  }

  private async loadAndValidateCredits(
    ids: number[],
  ): Promise<TransactionRecord[]> {
    const records: TransactionRecord[] = [];
    for (const id of ids) {
      const record = await this.transactionRepository.findRecordById(id);
      if (!record) {
        throw new TransactionNotFoundError(id);
      }
      if (record.type === 'transfer') {
        throw new TransactionIsTransferError(id);
      }
      if (record.type !== 'credit') {
        throw new ReturningTransactionNotCreditError(id);
      }
      records.push(record);
    }
    return records;
  }

  private async loadAndValidateDebits(
    ids: number[],
  ): Promise<TransactionRecord[]> {
    const records: TransactionRecord[] = [];
    for (const id of ids) {
      const record = await this.transactionRepository.findRecordById(id);
      if (!record) {
        throw new TransactionNotFoundError(id);
      }
      if (record.type === 'transfer') {
        throw new TransactionIsTransferError(id);
      }
      if (record.type !== 'debit') {
        throw new OriginalTransactionNotDebitError(id);
      }
      records.push(record);
    }
    return records;
  }

  private validateCurrency(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
  ): void {
    const allCurrencies = [
      ...credits.map((record) => record.currency),
      ...debits.map((record) => record.currency),
    ];
    const firstCurrency = allCurrencies[0];
    if (!firstCurrency) {
      return;
    }
    for (const currency of allCurrencies) {
      if (currency !== firstCurrency) {
        throw new CurrencyMismatchError(currency, firstCurrency);
      }
    }
  }

  private async processFullCancel(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    await this.recordReturnAuditForSets(debits, credits);

    for (const credit of credits) {
      await this.transactionRepository.delete(credit.externalId ?? '');
    }
    for (const debit of debits) {
      await this.transactionRepository.delete(debit.externalId ?? '');
    }

    return {
      type: 'full_cancel',
      survivingTransactionId: null,
      newSurvivingAmount: null,
      totalDebitAmount,
      totalCreditAmount,
    };
  }

  private async processDebitReduced(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    // Debit-anchor case: exactly one debit, 1+ credits absorbed into it.
    const survivingDebit = debits[0];
    if (!survivingDebit) {
      throw new EmptyReturningSideError('debit');
    }

    const newDebitAmount = totalDebitAmount - totalCreditAmount;

    await this.transactionRepository.updateTransactionAmount(
      survivingDebit.id,
      newDebitAmount,
    );

    await this.recordReturnAuditForSets(debits, credits);

    for (const credit of credits) {
      const creditBankTxs =
        await this.bankTransactionRepository.findByTransactionId(credit.id);
      for (const bankTx of creditBankTxs) {
        await this.bankTransactionRepository.linkTransactionSource(
          survivingDebit.id,
          bankTx.id,
        );
      }
      await this.transactionRepository.delete(credit.externalId ?? '');
    }

    return {
      type: 'debit_reduced',
      survivingTransactionId: survivingDebit.id,
      newSurvivingAmount: newDebitAmount,
      totalDebitAmount,
      totalCreditAmount,
    };
  }

  private async processCreditReduced(
    credits: TransactionRecord[],
    debits: TransactionRecord[],
    totalCreditAmount: number,
    totalDebitAmount: number,
  ): Promise<MarkAsReturningResponseDTO> {
    // Credit-anchor case: exactly one credit, 1+ debits absorbed into it.
    const survivingCredit = credits[0];
    if (!survivingCredit) {
      throw new EmptyReturningSideError('credit');
    }

    const newCreditAmount = totalCreditAmount - totalDebitAmount;

    await this.transactionRepository.updateTransactionAmount(
      survivingCredit.id,
      newCreditAmount,
    );

    await this.recordReturnAuditForSets(debits, credits);

    for (const debit of debits) {
      const debitBankTxs =
        await this.bankTransactionRepository.findByTransactionId(debit.id);
      for (const bankTx of debitBankTxs) {
        await this.bankTransactionRepository.linkTransactionSource(
          survivingCredit.id,
          bankTx.id,
        );
      }
      await this.transactionRepository.delete(debit.externalId ?? '');
    }

    return {
      type: 'credit_reduced',
      survivingTransactionId: survivingCredit.id,
      newSurvivingAmount: newCreditAmount,
      totalDebitAmount,
      totalCreditAmount,
    };
  }

  /**
   * Records expense ↔ refund audit pairs for every credit bank_tx against the
   * FIRST debit bank_tx we can find across all debit transactions. Matches the
   * simplified pairing carried over from the previous implementation — a
   * more accurate multi-debit × multi-credit allocation is a tracked follow-up.
   */
  private async recordReturnAuditForSets(
    debits: TransactionRecord[],
    credits: TransactionRecord[],
  ): Promise<void> {
    let firstDebitBankTx: BankTransaction | undefined;
    for (const debit of debits) {
      const debitBankTxs =
        await this.bankTransactionRepository.findByTransactionId(debit.id);
      firstDebitBankTx = debitBankTxs.find((bankTx) => bankTx.isDebit);
      if (firstDebitBankTx) {
        break;
      }
    }
    if (!firstDebitBankTx) {
      return;
    }

    for (const credit of credits) {
      const creditBankTxs =
        await this.bankTransactionRepository.findByTransactionId(credit.id);
      for (const creditBankTx of creditBankTxs) {
        await this.bankTransactionRepository.saveReturn({
          originalBankTransactionId: firstDebitBankTx.id,
          returningBankTransactionId: creditBankTx.id,
          amount: Math.abs(creditBankTx.amount.amount),
        });
      }
    }
  }
}

function sumAbs(records: TransactionRecord[]): number {
  return records.reduce((sum, record) => sum + Math.abs(record.amount), 0);
}
