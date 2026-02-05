import type { Account } from '@domain/entities/Account.ts';

/**
 * Maps Monobank card type to GraphQL AccountType enum.
 * Monobank stores type as card style (black, iron, etc.), we map to DEBIT/CREDIT/FOP.
 */
export const MONOBANK_TYPE_TO_GQL: Record<string, string> = {
  black: 'DEBIT',
  white: 'DEBIT',
  platinum: 'DEBIT',
  yellow: 'DEBIT',
  eAid: 'DEBIT',
  iron: 'CREDIT',
  fop: 'FOP',
};

export function mapAccountType(type: string | undefined): string {
  return MONOBANK_TYPE_TO_GQL[type ?? ''] ?? 'DEBIT';
}

export interface AccountGql {
  id: number | null;
  externalId: string;
  name: string;
  type: string;
  role: string;
  currency: string;
  balance: number;
  creditLimit: number | null;
  iban: string | null;
  bank: string | null;
  lastSyncTime: string | null;
  isCreditAccount: boolean;
}

export function mapAccountToGql(account: Account): AccountGql {
  return {
    id: account.dbId,
    externalId: account.externalId,
    name: account.name,
    type: mapAccountType(account.type),
    role: account.role.toUpperCase(),
    currency: account.currency.code,
    balance: account.balance.toMajorUnits(),
    creditLimit: account.creditLimit
      ? account.creditLimit.toMajorUnits()
      : null,
    iban: account.iban ?? null,
    bank: account.bank ?? null,
    lastSyncTime: account.lastSyncTime
      ? new Date(account.lastSyncTime).toISOString()
      : null,
    isCreditAccount: account.isCreditAccount,
  };
}
