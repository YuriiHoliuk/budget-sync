import type { Currency, Money } from '../value-objects/index.ts';

export type AccountRole = 'operational' | 'savings';

const VALID_ACCOUNT_ROLES: readonly AccountRole[] = ['operational', 'savings'];

/**
 * Type guard to check if a string is a valid AccountRole.
 * Returns true if the value is one of: 'operational', 'savings'
 */
export function isAccountRole(value: string): value is AccountRole {
  return VALID_ACCOUNT_ROLES.includes(value as AccountRole);
}

/**
 * Parse a string to AccountRole, returning a default if invalid.
 * Use this when you need a guaranteed AccountRole value.
 */
export function parseAccountRole(
  value: string | null | undefined,
  defaultValue: AccountRole = 'operational',
): AccountRole {
  if (value && isAccountRole(value)) {
    return value;
  }
  return defaultValue;
}

export type AccountType = 'debit' | 'credit' | 'fop';

const VALID_ACCOUNT_TYPES: readonly AccountType[] = ['debit', 'credit', 'fop'];

/**
 * Type guard to check if a string is a valid AccountType.
 */
export function isAccountType(value: string): value is AccountType {
  return VALID_ACCOUNT_TYPES.includes(value as AccountType);
}

/**
 * Parse a string to AccountType, returning a default if invalid.
 */
export function parseAccountType(
  value: string | null | undefined,
  defaultValue: AccountType = 'debit',
): AccountType {
  if (value && isAccountType(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Source of the account - indicates where the account data comes from.
 * - 'bank_sync': Synced from a bank API (protected fields: externalId, IBAN, currency)
 * - 'manual': Manually created by user (fully editable)
 */
export type AccountSource = 'bank_sync' | 'manual';

const VALID_ACCOUNT_SOURCES: readonly AccountSource[] = ['bank_sync', 'manual'];

/**
 * Type guard to check if a string is a valid AccountSource.
 */
export function isAccountSource(value: string): value is AccountSource {
  return VALID_ACCOUNT_SOURCES.includes(value as AccountSource);
}

/**
 * Parse a string to AccountSource, returning a default if invalid.
 */
export function parseAccountSource(
  value: string | null | undefined,
  defaultValue: AccountSource = 'manual',
): AccountSource {
  if (value && isAccountSource(value)) {
    return value;
  }
  return defaultValue;
}

export interface AccountProps {
  externalId: string;
  name: string;
  currency: Currency;
  balance: Money;
  initialBalance?: Money;
  creditLimit?: Money;
  type?: AccountType;
  role?: AccountRole;
  iban?: string;
  maskedPan?: string[];
  bank?: string;
  source?: AccountSource;
  isArchived?: boolean;
  lastSyncTime?: number;
  dbId?: number | null;
}

export class Account {
  private constructor(
    public readonly id: string,
    private readonly props: AccountProps,
  ) {}

  static create(props: AccountProps, id?: string): Account {
    const accountId = id ?? props.externalId;
    return new Account(accountId, props);
  }

  get externalId(): string {
    return this.props.externalId;
  }

  get name(): string {
    return this.props.name;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get balance(): Money {
    return this.props.balance;
  }

  get type(): AccountType {
    return this.props.type ?? 'debit';
  }

  get role(): AccountRole {
    return this.props.role ?? 'operational';
  }

  get iban(): string | undefined {
    return this.props.iban;
  }

  get maskedPan(): string[] | undefined {
    return this.props.maskedPan;
  }

  get creditLimit(): Money | undefined {
    return this.props.creditLimit;
  }

  get initialBalance(): Money | undefined {
    return this.props.initialBalance;
  }

  get bank(): string | undefined {
    return this.props.bank;
  }

  get lastSyncTime(): number | undefined {
    return this.props.lastSyncTime;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  /**
   * Returns the source of this account (monobank or manual).
   * Synced accounts (monobank) have protected fields that cannot be edited.
   */
  get source(): AccountSource {
    return this.props.source ?? 'manual';
  }

  /**
   * Returns true if this account is archived (soft deleted).
   */
  get isArchived(): boolean {
    return this.props.isArchived ?? false;
  }

  /**
   * Returns true if this account is synced from an external source.
   * Synced accounts have protected fields (externalId, IBAN, currency).
   */
  get isSynced(): boolean {
    return this.source !== 'manual';
  }

  /**
   * Returns true if this account has a credit limit (is a credit card).
   */
  get isCreditAccount(): boolean {
    return (
      this.props.creditLimit !== undefined && this.props.creditLimit.amount > 0
    );
  }

  /**
   * For credit accounts, returns the actual balance (balance - creditLimit).
   * This shows negative when credit is used.
   * For non-credit accounts, returns the regular balance.
   */
  get actualBalance(): Money {
    if (this.isCreditAccount && this.props.creditLimit) {
      return this.props.balance.subtract(this.props.creditLimit);
    }
    return this.props.balance;
  }

  withDbId(dbId: number): Account {
    return Account.create({ ...this.props, dbId }, this.id);
  }

  /**
   * Creates a new Account with updated properties.
   * For synced accounts, protected fields (externalId, iban, currency) are not allowed to change.
   */
  withUpdatedProps(updates: Partial<AccountProps>): Account {
    return Account.create(
      {
        ...this.props,
        ...updates,
      },
      this.id,
    );
  }

  /**
   * Creates an archived copy of this account.
   */
  archive(): Account {
    return this.withUpdatedProps({ isArchived: true });
  }
}
