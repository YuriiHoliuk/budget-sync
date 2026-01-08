import type { Transaction } from '../entities/Transaction.ts';
import { Repository } from './Repository.ts';

/**
 * Injection token for TransactionRepository.
 * Use with @inject(TRANSACTION_REPOSITORY_TOKEN) in classes that depend on TransactionRepository.
 */
export const TRANSACTION_REPOSITORY_TOKEN = Symbol('TransactionRepository');

/**
 * Transaction-specific repository with additional query methods.
 * Extends the generic Repository with Transaction-specific operations.
 */
export abstract class TransactionRepository extends Repository<
  Transaction,
  string
> {
  abstract findByExternalId(externalId: string): Promise<Transaction | null>;
  abstract findByExternalIds(
    externalIds: string[],
  ): Promise<Map<string, Transaction>>;
  abstract findByAccountId(accountId: string): Promise<Transaction[]>;
  abstract saveMany(transactions: Transaction[]): Promise<void>;
  abstract updateMany(transactions: Transaction[]): Promise<void>;
}
