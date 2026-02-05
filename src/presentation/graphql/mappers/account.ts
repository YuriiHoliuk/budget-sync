import type {
  Account,
  AccountRole,
  AccountSource,
  AccountType,
} from '@domain/entities/Account.ts';

/**
 * Maps domain AccountType to GraphQL AccountType enum.
 */
const ACCOUNT_TYPE_TO_GQL: Record<AccountType, string> = {
  debit: 'DEBIT',
  credit: 'CREDIT',
  fop: 'FOP',
};

/**
 * Maps GraphQL AccountType enum to domain AccountType.
 */
export const GQL_TO_ACCOUNT_TYPE: Record<string, AccountType> = {
  DEBIT: 'debit',
  CREDIT: 'credit',
  FOP: 'fop',
};

/**
 * Maps GraphQL AccountRole enum to domain AccountRole.
 */
export const GQL_TO_ACCOUNT_ROLE: Record<string, AccountRole> = {
  OPERATIONAL: 'operational',
  SAVINGS: 'savings',
};

/**
 * Maps domain AccountSource to GraphQL AccountSource enum.
 */
const ACCOUNT_SOURCE_TO_GQL: Record<AccountSource, string> = {
  bank_sync: 'BANK_SYNC',
  manual: 'MANUAL',
};

export function mapAccountType(type: AccountType): string {
  return ACCOUNT_TYPE_TO_GQL[type];
}

export function mapAccountSource(source: AccountSource): string {
  return ACCOUNT_SOURCE_TO_GQL[source];
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
  source: string;
  isArchived: boolean;
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
    source: mapAccountSource(account.source),
    isArchived: account.isArchived,
    lastSyncTime: account.lastSyncTime
      ? new Date(account.lastSyncTime).toISOString()
      : null,
    isCreditAccount: account.isCreditAccount,
  };
}
