import type { Currency, Money } from '../value-objects/index.ts';

export interface AccountProps {
  externalId: string;
  name: string;
  currency: Currency;
  balance: Money;
  creditLimit?: Money;
  type?: string;
  iban?: string;
  maskedPan?: string[];
  bank?: string;
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

  get type(): string | undefined {
    return this.props.type;
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
}
