import {
  type Currency,
  type Money,
  TransactionType,
} from '../value-objects/index.ts';

export interface BankTransactionProps {
  externalId: string;
  accountId: number;
  accountExternalId?: string;
  date: Date;
  amount: Money;
  currency: Currency;
  type: TransactionType;
  mcc?: number;
  originalMcc?: number;
  bankCategory?: string;
  bankDescription?: string;
  counterparty?: string;
  counterpartyIban?: string;
  counterEdrpou?: string;
  balanceAfter?: Money;
  operationAmount?: Money;
  operationCurrency?: Currency;
  cashback?: Money;
  commission?: Money;
  hold?: boolean;
  receiptId?: string;
  invoiceId?: string;
}

/**
 * Immutable entity representing raw bank transaction data.
 * This is the original record from the bank, preserved as-is.
 * The id is a DB serial (number), set after persistence.
 */
export class BankTransaction {
  private constructor(
    public readonly id: number,
    private readonly props: BankTransactionProps,
  ) {}

  static create(props: BankTransactionProps, id?: number): BankTransaction {
    return new BankTransaction(id ?? 0, props);
  }

  get externalId(): string {
    return this.props.externalId;
  }

  get accountId(): number {
    return this.props.accountId;
  }

  get accountExternalId(): string | undefined {
    return this.props.accountExternalId;
  }

  get date(): Date {
    return this.props.date;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get type(): TransactionType {
    return this.props.type;
  }

  get mcc(): number | undefined {
    return this.props.mcc;
  }

  get originalMcc(): number | undefined {
    return this.props.originalMcc;
  }

  get bankCategory(): string | undefined {
    return this.props.bankCategory;
  }

  get bankDescription(): string | undefined {
    return this.props.bankDescription;
  }

  get counterparty(): string | undefined {
    return this.props.counterparty;
  }

  get counterpartyIban(): string | undefined {
    return this.props.counterpartyIban;
  }

  get counterEdrpou(): string | undefined {
    return this.props.counterEdrpou;
  }

  get balanceAfter(): Money | undefined {
    return this.props.balanceAfter;
  }

  get operationAmount(): Money | undefined {
    return this.props.operationAmount;
  }

  get operationCurrency(): Currency | undefined {
    return this.props.operationCurrency;
  }

  get cashback(): Money | undefined {
    return this.props.cashback;
  }

  get commission(): Money | undefined {
    return this.props.commission;
  }

  get hold(): boolean {
    return this.props.hold ?? false;
  }

  get receiptId(): string | undefined {
    return this.props.receiptId;
  }

  get invoiceId(): string | undefined {
    return this.props.invoiceId;
  }

  get isCredit(): boolean {
    return this.props.type === TransactionType.CREDIT;
  }

  get isDebit(): boolean {
    return this.props.type === TransactionType.DEBIT;
  }

  /**
   * Returns a new BankTransaction with the DB id set.
   * Used after persistence to attach the auto-generated serial id.
   */
  withId(id: number): BankTransaction {
    return new BankTransaction(id, this.props);
  }
}
