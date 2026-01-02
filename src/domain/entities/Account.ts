import type { Currency, Money } from '../value-objects/index.ts';

export interface AccountProps {
  externalId: string;
  name: string;
  currency: Currency;
  balance: Money;
  type?: string;
  iban?: string;
  maskedPan?: string[];
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
}
