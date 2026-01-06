import type { WebhookTransactionData } from '../dtos/WebhookTransactionData.ts';
import type { Account } from '../entities/Account.ts';
import type { Transaction } from '../entities/Transaction.ts';

/**
 * Injection token for BankGateway.
 * Use with @inject(BANK_GATEWAY_TOKEN) in classes that depend on BankGateway.
 */
export const BANK_GATEWAY_TOKEN = Symbol('BankGateway');

export abstract class BankGateway {
  abstract getAccounts(): Promise<Account[]>;
  abstract getTransactions(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]>;
  abstract setWebhook(url: string): Promise<void>;

  /**
   * Parse and validate a webhook payload from the bank.
   *
   * This method validates the raw webhook payload and converts it to
   * domain types. Implementation is bank-specific.
   *
   * @param payload - Raw webhook payload (typically from HTTP request body)
   * @returns Parsed transaction data with domain types
   * @throws Error if payload validation fails
   */
  abstract parseWebhookPayload(payload: unknown): WebhookTransactionData;
}
