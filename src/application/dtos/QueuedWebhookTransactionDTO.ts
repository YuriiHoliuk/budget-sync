/**
 * Serializable DTO for webhook transactions stored in the message queue.
 *
 * This DTO uses only primitive types so it can be safely serialized to JSON
 * and deserialized without losing data. Domain entities like Transaction
 * and Money are reconstructed from these primitives when processing.
 */
export interface QueuedWebhookTransactionDTO {
  /** Account external ID (from the bank) */
  accountExternalId: string;

  /** New account balance after this transaction (in minor units), as reported by the bank */
  newBalanceAmount: number;

  /** Currency code for the new balance (ISO 4217 numeric) */
  newBalanceCurrencyCode: number;

  /** Transaction data with primitive types */
  transaction: {
    externalId: string;
    /** ISO 8601 date string */
    date: string;
    /** Amount in minor units (kopecks, cents) */
    amount: number;
    /** Currency code (ISO 4217 numeric) */
    currencyCode: number;
    /** Operation amount in minor units */
    operationAmount: number;
    /** Operation currency code */
    operationCurrencyCode: number;
    description: string;
    /** Transaction type: 'CREDIT' or 'DEBIT' */
    type: 'CREDIT' | 'DEBIT';
    mcc: number;
    hold: boolean;
    /** Balance after transaction in minor units */
    balanceAmount: number;
    comment?: string;
    counterpartyName?: string;
    counterpartyIban?: string;
    /** Cashback amount in minor units */
    cashbackAmount?: number;
    /** Commission/fee amount in minor units */
    commissionRate?: number;
    /** Original MCC before bank correction */
    originalMcc?: number;
    /** Receipt ID for check.gov.ua */
    receiptId?: string;
    /** Invoice ID (FOP accounts) */
    invoiceId?: string;
    /** Counterparty tax ID (EDRPOU) */
    counterEdrpou?: string;
  };
}
