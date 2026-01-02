import type { Account } from '../entities/Account.ts';
import type { Transaction } from '../entities/Transaction.ts';

export abstract class BankGateway {
  abstract getAccounts(): Promise<Account[]>;
  abstract getTransactions(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Transaction[]>;
}
