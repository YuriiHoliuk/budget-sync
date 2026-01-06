import type { Transaction } from '../entities/Transaction.ts';
import type { Money } from '../value-objects/Money.ts';

/**
 * Data structure for incoming webhook transactions.
 *
 * This DTO is used to pass parsed webhook data between layers.
 * The gateway parses bank-specific webhook payloads and returns this
 * domain-friendly structure.
 */
export interface WebhookTransactionData {
  /** The transaction entity, ready to be saved */
  transaction: Transaction;
  /** Account external ID (from the bank) to find the account */
  accountExternalId: string;
  /** New account balance after this transaction */
  newBalance: Money;
}
