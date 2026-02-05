import { Account, parseAccountRole } from '@domain/entities/Account.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { AccountRow, NewAccountRow } from '@modules/database/types.ts';

const DB_TYPE_TO_MONOBANK: Record<string, string> = {
  debit: 'black',
  credit: 'iron',
  fop: 'fop',
};

const MONOBANK_TO_DB_TYPE: Record<string, string> = {
  black: 'debit',
  white: 'debit',
  platinum: 'debit',
  yellow: 'debit',
  eAid: 'debit',
  iron: 'credit',
  fop: 'fop',
};

export class DatabaseAccountMapper {
  toEntity(row: AccountRow): Account {
    const currency = Currency.fromCode(row.currency);
    const balance = Money.create(row.balance, currency);
    const creditLimit =
      row.creditLimit != null && row.creditLimit > 0
        ? Money.create(row.creditLimit, currency)
        : undefined;
    const accountType = DB_TYPE_TO_MONOBANK[row.type] ?? 'black';

    return Account.create(
      {
        externalId: row.externalId ?? '',
        name: row.externalName ?? row.name ?? '',
        currency,
        balance,
        creditLimit,
        type: accountType,
        role: parseAccountRole(row.role),
        iban: row.iban ?? undefined,
        bank: row.bank ?? undefined,
        lastSyncTime: row.lastSyncTime ? row.lastSyncTime.getTime() : undefined,
        dbId: row.id,
      },
      row.externalId ?? String(row.id),
    );
  }

  toInsert(account: Account, existingName?: string): NewAccountRow {
    const accountType = account.type
      ? (MONOBANK_TO_DB_TYPE[account.type] ?? 'debit')
      : 'debit';

    return {
      externalId: account.externalId || null,
      name: existingName ?? account.name,
      externalName: account.name,
      type: accountType,
      currency: account.currency.code,
      balance: account.balance.amount,
      role: account.role,
      creditLimit: account.creditLimit?.amount ?? 0,
      iban: account.iban ?? null,
      bank: account.bank ?? null,
      lastSyncTime: account.lastSyncTime
        ? new Date(account.lastSyncTime)
        : null,
    };
  }
}
