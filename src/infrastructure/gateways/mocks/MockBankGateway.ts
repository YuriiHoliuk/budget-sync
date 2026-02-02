import type { WebhookTransactionData } from '@domain/dtos/WebhookTransactionData.ts';
import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import { BankGateway } from '@domain/gateways/BankGateway.ts';
import { injectable } from 'tsyringe';

/**
 * Mock bank gateway for local development.
 * Returns empty results — no real bank API calls.
 */
@injectable()
export class MockBankGateway extends BankGateway {
  getAccounts(): Promise<Account[]> {
    return Promise.resolve([]);
  }

  getTransactions(
    _accountId: string,
    _from: Date,
    _to: Date,
  ): Promise<Transaction[]> {
    return Promise.resolve([]);
  }

  setWebhook(_url: string): Promise<void> {
    return Promise.resolve();
  }

  parseWebhookPayload(_payload: unknown): WebhookTransactionData {
    throw new Error('Webhook parsing not available in local development');
  }
}
