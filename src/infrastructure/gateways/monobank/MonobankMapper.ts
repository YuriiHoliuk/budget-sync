import { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import type { MonobankAccount, MonobankStatementItem } from './types.ts';

export class MonobankMapper {
  toAccount(raw: MonobankAccount): Account {
    const currency = Currency.fromNumericCode(raw.currencyCode);
    const balance = Money.create(raw.balance, currency);
    const creditLimit =
      raw.creditLimit > 0 ? Money.create(raw.creditLimit, currency) : undefined;

    return Account.create({
      externalId: raw.id,
      name: this.buildAccountName(raw),
      currency,
      balance,
      creditLimit,
      type: raw.type,
      iban: raw.iban,
      maskedPan: raw.maskedPan,
    });
  }

  toTransaction(raw: MonobankStatementItem, accountId: string): Transaction {
    const currency = Currency.fromNumericCode(raw.currencyCode);
    const amount = Money.create(raw.amount, currency);
    const balance = Money.create(raw.balance, currency);
    const operationAmount = Money.create(raw.operationAmount, currency);
    const transactionType =
      raw.amount >= 0 ? TransactionType.CREDIT : TransactionType.DEBIT;

    return Transaction.create({
      externalId: raw.id,
      date: new Date(raw.time * 1000),
      amount,
      operationAmount,
      description: raw.description,
      type: transactionType,
      accountId,
      mcc: raw.mcc,
      comment: raw.comment,
      balance,
      counterpartyName: raw.counterName,
      counterpartyIban: raw.counterIban,
      hold: raw.hold,
    });
  }

  private buildAccountName(raw: MonobankAccount): string {
    const typeNames: Record<string, string> = {
      black: 'Black Card',
      white: 'White Card',
      platinum: 'Platinum Card',
      iron: 'Iron Card',
      fop: 'FOP Account',
      yellow: 'Yellow Card',
      eAid: 'eSupport',
    };

    const typeName = typeNames[raw.type] ?? raw.type;
    const currency = Currency.fromNumericCode(raw.currencyCode);

    if (raw.maskedPan && raw.maskedPan.length > 0) {
      const lastFour = raw.maskedPan[0]?.slice(-4) ?? '';
      return `${typeName} *${lastFour} (${currency.code})`;
    }

    return `${typeName} (${currency.code})`;
  }
}
