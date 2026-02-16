import {
  BankTransaction,
  type BankTransactionProps,
} from '@domain/entities/BankTransaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import type {
  BankTransactionRow,
  NewBankTransactionRow,
} from '@modules/database/types.ts';

export class DatabaseBankTransactionMapper {
  toEntity(row: BankTransactionRow): BankTransaction {
    const currency = Currency.fromCode(row.currency);
    const type = this.parseTransactionType(row);

    const props: BankTransactionProps = {
      externalId: row.externalId,
      accountId: row.accountId ?? 0,
      accountExternalId: row.accountExternalId ?? undefined,
      date: row.date,
      amount: Money.create(row.amount, currency),
      currency,
      type,
      ...this.parseOptionalFields(row, currency),
    };

    return BankTransaction.create(props, row.id);
  }

  toInsert(entity: BankTransaction): NewBankTransactionRow {
    return {
      ...this.buildInsertBaseFields(entity),
      ...this.buildInsertDescriptionFields(entity),
      ...this.buildInsertCounterpartyFields(entity),
      ...this.buildInsertFinancialFields(entity),
      ...this.buildInsertMetadataFields(entity),
    };
  }

  private buildInsertBaseFields(entity: BankTransaction) {
    return {
      externalId: entity.externalId,
      accountId: entity.accountId || null,
      accountExternalId: entity.accountExternalId ?? null,
      date: entity.date,
      amount: entity.amount.amount,
      currency: entity.currency.code,
      type: entity.isCredit ? ('credit' as const) : ('debit' as const),
    };
  }

  private buildInsertDescriptionFields(entity: BankTransaction) {
    return {
      mcc: entity.mcc ?? null,
      originalMcc: entity.originalMcc ?? null,
      bankCategory: entity.bankCategory ?? null,
      bankDescription: entity.bankDescription ?? null,
    };
  }

  private buildInsertCounterpartyFields(entity: BankTransaction) {
    return {
      counterparty: entity.counterparty ?? null,
      counterpartyIban: entity.counterpartyIban ?? null,
      counterEdrpou: entity.counterEdrpou ?? null,
    };
  }

  private buildInsertFinancialFields(entity: BankTransaction) {
    return {
      balanceAfter: entity.balanceAfter?.amount ?? null,
      operationAmount: entity.operationAmount?.amount ?? null,
      operationCurrency: entity.operationCurrency?.code ?? null,
      cashback: entity.cashback?.amount ?? 0,
      commission: entity.commission?.amount ?? 0,
    };
  }

  private buildInsertMetadataFields(entity: BankTransaction) {
    return {
      hold: entity.hold,
      receiptId: entity.receiptId ?? null,
      invoiceId: entity.invoiceId ?? null,
    };
  }

  private parseTransactionType(row: BankTransactionRow): TransactionType {
    return row.type === 'credit'
      ? TransactionType.CREDIT
      : TransactionType.DEBIT;
  }

  private parseOptionalFields(row: BankTransactionRow, currency: Currency) {
    return {
      mcc: row.mcc ?? undefined,
      originalMcc: row.originalMcc ?? undefined,
      bankCategory: row.bankCategory ?? undefined,
      bankDescription: row.bankDescription ?? undefined,
      counterparty: row.counterparty ?? undefined,
      counterpartyIban: row.counterpartyIban ?? undefined,
      counterEdrpou: row.counterEdrpou ?? undefined,
      balanceAfter: this.parseOptionalMoney(row.balanceAfter, currency),
      operationAmount: this.parseOperationAmount(row),
      operationCurrency: this.parseOperationCurrency(row),
      cashback: this.parseOptionalMoney(row.cashback, currency),
      commission: this.parseOptionalMoney(row.commission, currency),
      hold: row.hold ?? undefined,
      receiptId: row.receiptId ?? undefined,
      invoiceId: row.invoiceId ?? undefined,
    };
  }

  private parseOptionalMoney(
    value: number | null,
    currency: Currency,
  ): Money | undefined {
    return value != null ? Money.create(value, currency) : undefined;
  }

  private parseOperationAmount(row: BankTransactionRow): Money | undefined {
    if (row.operationAmount != null && row.operationCurrency) {
      return Money.create(
        row.operationAmount,
        Currency.fromCode(row.operationCurrency),
      );
    }
    return undefined;
  }

  private parseOperationCurrency(
    row: BankTransactionRow,
  ): Currency | undefined {
    if (row.operationCurrency) {
      return Currency.fromCode(row.operationCurrency);
    }
    return undefined;
  }
}
