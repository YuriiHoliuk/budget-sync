import { type Money, TransactionType } from '../value-objects/index.ts';

export interface TransactionProps {
  externalId: string;
  date: Date;
  amount: Money;
  operationAmount?: Money;
  description: string;
  type: TransactionType;
  accountId: string;
  mcc?: number;
  comment?: string;
  balance?: Money;
  counterpartyName?: string;
  counterpartyIban?: string;
  hold?: boolean;
  /** Cashback earned (in minor units) */
  cashbackAmount?: Money;
  /** Commission/fees paid (in minor units) */
  commissionRate?: Money;
  /** Original MCC before bank correction */
  originalMcc?: number;
  /** Receipt ID for check.gov.ua */
  receiptId?: string;
  /** Invoice ID (FOP accounts) */
  invoiceId?: string;
  /** Counterparty tax ID (EDRPOU) */
  counterEdrpou?: string;
  dbId?: number | null;
}

export class Transaction {
  private constructor(
    public readonly id: string,
    private readonly props: TransactionProps,
  ) {}

  static create(props: TransactionProps, id?: string): Transaction {
    const transactionId = id ?? props.externalId;
    return new Transaction(transactionId, props);
  }

  get externalId(): string {
    return this.props.externalId;
  }

  get date(): Date {
    return this.props.date;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get operationAmount(): Money | undefined {
    return this.props.operationAmount;
  }

  get description(): string {
    return this.props.description;
  }

  get type(): TransactionType {
    return this.props.type;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get mcc(): number | undefined {
    return this.props.mcc;
  }

  get comment(): string | undefined {
    return this.props.comment;
  }

  get balance(): Money | undefined {
    return this.props.balance;
  }

  get counterpartyName(): string | undefined {
    return this.props.counterpartyName;
  }

  get counterpartyIban(): string | undefined {
    return this.props.counterpartyIban;
  }

  get isHold(): boolean {
    return this.props.hold ?? false;
  }

  get cashbackAmount(): Money | undefined {
    return this.props.cashbackAmount;
  }

  get commissionRate(): Money | undefined {
    return this.props.commissionRate;
  }

  get originalMcc(): number | undefined {
    return this.props.originalMcc;
  }

  get receiptId(): string | undefined {
    return this.props.receiptId;
  }

  get invoiceId(): string | undefined {
    return this.props.invoiceId;
  }

  get counterEdrpou(): string | undefined {
    return this.props.counterEdrpou;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  get isCredit(): boolean {
    return this.props.type === TransactionType.CREDIT;
  }

  get isDebit(): boolean {
    return this.props.type === TransactionType.DEBIT;
  }

  withDbId(dbId: number): Transaction {
    return Transaction.create({ ...this.props, dbId }, this.id);
  }
}
