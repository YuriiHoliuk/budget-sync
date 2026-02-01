import { Transaction } from '@domain/entities/Transaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import type {
  NewTransactionRow,
  TransactionRow,
} from '@modules/database/types.ts';

export class DatabaseTransactionMapper {
  toEntity(row: TransactionRow): Transaction {
    const currency = Currency.fromCode(row.currency);
    const amount = this.parseAmount(row, currency);
    const transactionType = this.parseTransactionType(row);

    return Transaction.create(
      {
        externalId: row.externalId ?? '',
        date: row.date,
        amount,
        description: row.bankDescription ?? '',
        type: transactionType,
        accountId: row.accountExternalId ?? '',
        ...this.parseOptionalFields(row, currency),
      },
      row.externalId ?? String(row.id),
    );
  }

  toInsert(
    transaction: Transaction,
    refs?: { accountDbId?: number; categoryDbId?: number; budgetDbId?: number },
  ): NewTransactionRow {
    const signedAmount = this.calculateSignedAmount(transaction);

    return {
      ...this.buildInsertBaseFields(transaction, signedAmount),
      ...this.buildInsertRefFields(transaction, refs),
      ...this.buildInsertCategorizationFields(),
      ...this.buildInsertCounterpartyFields(transaction),
      ...this.buildInsertFinancialFields(transaction),
      ...this.buildInsertMetadataFields(transaction),
    };
  }

  private parseAmount(row: TransactionRow, currency: Currency): Money {
    const absoluteAmount = Math.abs(row.amount);
    return Money.create(absoluteAmount, currency);
  }

  private parseTransactionType(row: TransactionRow): TransactionType {
    return row.type === 'credit'
      ? TransactionType.CREDIT
      : TransactionType.DEBIT;
  }

  private parseOptionalFields(row: TransactionRow, currency: Currency) {
    return {
      mcc: row.mcc ?? undefined,
      comment: row.notes ?? undefined,
      balance: this.parseOptionalMoney(row.balanceAfter, currency),
      operationAmount: this.parseOperationAmount(row),
      counterpartyName: row.counterparty ?? undefined,
      counterpartyIban: row.counterpartyIban ?? undefined,
      hold: row.hold ?? undefined,
      cashbackAmount: this.parseOptionalMoney(row.cashback, currency),
      commissionRate: this.parseOptionalMoney(row.commission, currency),
      originalMcc: row.originalMcc ?? undefined,
      receiptId: row.receiptId ?? undefined,
      invoiceId: row.invoiceId ?? undefined,
      counterEdrpou: row.counterEdrpou ?? undefined,
      dbId: row.id,
    };
  }

  private parseOptionalMoney(
    value: number | null,
    currency: Currency,
  ): Money | undefined {
    return value != null ? Money.create(value, currency) : undefined;
  }

  private parseOperationAmount(row: TransactionRow): Money | undefined {
    if (row.operationAmount != null && row.operationCurrency) {
      return Money.create(
        row.operationAmount,
        Currency.fromCode(row.operationCurrency),
      );
    }
    return undefined;
  }

  private calculateSignedAmount(transaction: Transaction): number {
    return transaction.isDebit
      ? -transaction.amount.amount
      : transaction.amount.amount;
  }

  private buildInsertBaseFields(
    transaction: Transaction,
    signedAmount: number,
  ) {
    return {
      externalId: transaction.externalId || null,
      date: transaction.date,
      amount: signedAmount,
      currency: transaction.amount.currency.code,
      type: transaction.isCredit ? ('credit' as const) : ('debit' as const),
    };
  }

  private buildInsertRefFields(
    transaction: Transaction,
    refs?: { accountDbId?: number; categoryDbId?: number; budgetDbId?: number },
  ) {
    return {
      accountId: refs?.accountDbId ?? null,
      accountExternalId: transaction.accountId || null,
      categoryId: refs?.categoryDbId ?? null,
      budgetId: refs?.budgetDbId ?? null,
    };
  }

  private buildInsertCategorizationFields() {
    return {
      categorizationStatus: 'pending' as const,
      categoryReason: null,
      budgetReason: null,
    };
  }

  private buildInsertCounterpartyFields(transaction: Transaction) {
    return {
      mcc: transaction.mcc ?? null,
      originalMcc: transaction.originalMcc ?? null,
      bankCategory: null,
      bankDescription: transaction.description || null,
      counterparty: transaction.counterpartyName ?? null,
      counterpartyIban: transaction.counterpartyIban ?? null,
      counterEdrpou: transaction.counterEdrpou ?? null,
    };
  }

  private buildInsertFinancialFields(transaction: Transaction) {
    return {
      balanceAfter: transaction.balance?.amount ?? null,
      operationAmount: transaction.operationAmount?.amount ?? null,
      operationCurrency: transaction.operationAmount?.currency.code ?? null,
      cashback: transaction.cashbackAmount?.amount ?? 0,
      commission: transaction.commissionRate?.amount ?? 0,
    };
  }

  private buildInsertMetadataFields(transaction: Transaction) {
    return {
      hold: transaction.isHold,
      receiptId: transaction.receiptId ?? null,
      invoiceId: transaction.invoiceId ?? null,
      tags: null,
      notes: transaction.comment ?? null,
    };
  }
}
