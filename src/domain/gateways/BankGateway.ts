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
}
