import { z } from 'zod';

/**
 * Zod schema for transaction data within the queued webhook message.
 */
const queuedTransactionSchema = z.object({
  externalId: z.string(),
  /** ISO 8601 date string */
  date: z.string(),
  /** Amount in minor units (kopecks, cents) */
  amount: z.number(),
  /** Currency code (ISO 4217 numeric) */
  currencyCode: z.number(),
  /** Operation amount in minor units */
  operationAmount: z.number(),
  /** Operation currency code */
  operationCurrencyCode: z.number(),
  description: z.string(),
  /** Transaction type: 'CREDIT' or 'DEBIT' */
  type: z.enum(['CREDIT', 'DEBIT']),
  mcc: z.number(),
  hold: z.boolean(),
  /** Balance after transaction in minor units */
  balanceAmount: z.number(),
  comment: z.string().optional(),
  counterpartyName: z.string().optional(),
  counterpartyIban: z.string().optional(),
  /** Cashback amount in minor units */
  cashbackAmount: z.number().optional(),
  /** Commission/fee amount in minor units */
  commissionRate: z.number().optional(),
  /** Original MCC before bank correction */
  originalMcc: z.number().optional(),
  /** Receipt ID for check.gov.ua */
  receiptId: z.string().optional(),
  /** Invoice ID (FOP accounts) */
  invoiceId: z.string().optional(),
  /** Counterparty tax ID (EDRPOU) */
  counterEdrpou: z.string().optional(),
});

/**
 * Zod schema for webhook transactions stored in the message queue.
 *
 * This DTO uses only primitive types so it can be safely serialized to JSON
 * and deserialized without losing data. Domain entities like Transaction
 * and Money are reconstructed from these primitives when processing.
 */
export const queuedWebhookTransactionSchema = z.object({
  /** Account external ID (from the bank) */
  accountExternalId: z.string(),
  /** New account balance after this transaction (in minor units), as reported by the bank */
  newBalanceAmount: z.number(),
  /** Currency code for the new balance (ISO 4217 numeric) */
  newBalanceCurrencyCode: z.number(),
  /** Transaction data with primitive types */
  transaction: queuedTransactionSchema,
});

/**
 * Serializable DTO for webhook transactions stored in the message queue.
 * Type inferred from the Zod schema.
 */
export type QueuedWebhookTransactionDTO = z.infer<
  typeof queuedWebhookTransactionSchema
>;
