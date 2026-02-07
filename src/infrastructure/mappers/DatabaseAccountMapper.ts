import {
  Account,
  parseAccountRole,
  parseAccountSource,
  parseAccountType,
} from '@domain/entities/Account.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { AccountRow, NewAccountRow } from '@modules/database/types.ts';

export class DatabaseAccountMapper {
  toEntity(row: AccountRow): Account {
    const currency = Currency.fromCode(row.currency);
    const balance = Money.create(row.balance, currency);
    const creditLimit =
      row.creditLimit != null && row.creditLimit > 0
        ? Money.create(row.creditLimit, currency)
        : undefined;
    const initialBalance =
      row.initialBalance != null
        ? Money.create(row.initialBalance, currency)
        : undefined;

    return Account.create(
      {
        externalId: row.externalId ?? '',
        name: row.externalName ?? row.name ?? '',
        currency,
        balance,
        initialBalance,
        creditLimit,
        type: parseAccountType(row.type),
        role: parseAccountRole(row.role),
        iban: row.iban ?? undefined,
        bank: row.bank ?? undefined,
        source: parseAccountSource(row.source),
        isArchived: row.isArchived,
        lastSyncTime: row.lastSyncTime ? row.lastSyncTime.getTime() : undefined,
        dbId: row.id,
      },
      row.externalId ?? String(row.id),
    );
  }

  toInsert(account: Account, existingName?: string): NewAccountRow {
    return {
      externalId: account.externalId || null,
      name: existingName ?? account.name,
      externalName: account.name,
      type: account.type,
      currency: account.currency.code,
      balance: account.balance.amount,
      initialBalance: account.initialBalance?.amount ?? null,
      role: account.role,
      creditLimit: account.creditLimit?.amount ?? 0,
      iban: account.iban ?? null,
      bank: account.bank ?? null,
      source: account.source,
      isArchived: account.isArchived,
      lastSyncTime: account.lastSyncTime
        ? new Date(account.lastSyncTime)
        : null,
    };
  }
}
