import { z } from 'zod';

/**
 * Zod schema for Monobank statement item in webhook payload.
 *
 * Based on Monobank API documentation (docs/monobank-api.md).
 * All monetary values are in minor currency units (kopecks, cents).
 */
const statementItemSchema = z.object({
  /** Unique transaction ID */
  id: z.string(),
  /** Transaction time (Unix timestamp, seconds) */
  time: z.number(),
  /** Transaction description */
  description: z.string(),
  /** Merchant Category Code (ISO 18245) */
  mcc: z.number(),
  /** Original MCC */
  originalMcc: z.number(),
  /** Authorization hold status */
  hold: z.boolean(),
  /** Amount in account currency (minor units) */
  amount: z.number(),
  /** Amount in transaction currency (minor units) */
  operationAmount: z.number(),
  /** Currency code (ISO 4217) */
  currencyCode: z.number(),
  /** Commission in minor units */
  commissionRate: z.number(),
  /** Cashback in minor units */
  cashbackAmount: z.number(),
  /** Account balance after transaction */
  balance: z.number(),
  /** User comment (optional) */
  comment: z.string().optional(),
  /** Receipt number for check.gov.ua (optional) */
  receiptId: z.string().optional(),
  /** FOP invoice number (optional) */
  invoiceId: z.string().optional(),
  /** Counterparty EDRPOU (FOP accounts only) */
  counterEdrpou: z.string().optional(),
  /** Counterparty IBAN (FOP accounts only) */
  counterIban: z.string().optional(),
  /** Counterparty name */
  counterName: z.string().optional(),
});

/**
 * Zod schema for validating Monobank webhook payloads.
 *
 * Monobank sends POST requests with transaction data in this format.
 * Currently only "StatementItem" type is supported.
 *
 * @example
 * ```typescript
 * const payload = await request.json();
 * const validated = webhookPayloadSchema.parse(payload);
 * // validated.type === "StatementItem"
 * // validated.data.account === "account_id"
 * // validated.data.statementItem.id === "transaction_id"
 * ```
 */
export const webhookPayloadSchema = z.object({
  /** Event type - only "StatementItem" is currently supported */
  type: z.literal('StatementItem'),
  /** Event data */
  data: z.object({
    /** Account ID the transaction belongs to */
    account: z.string(),
    /** Statement item (transaction) data */
    statementItem: statementItemSchema,
  }),
});

/**
 * TypeScript type inferred from the webhook payload schema.
 * Use this type when working with validated webhook payloads.
 */
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
