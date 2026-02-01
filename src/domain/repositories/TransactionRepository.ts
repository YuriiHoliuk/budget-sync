import type { Transaction } from '../entities/Transaction.ts';
import type { CategorizationStatus } from '../value-objects/CategorizationStatus.ts';
import { Repository } from './Repository.ts';

/**
 * Data for updating transaction categorization fields.
 * Used when LLM categorizes a transaction.
 */
export interface CategorizationUpdate {
  /** Assigned category name */
  category: string | null;
  /** Assigned budget name */
  budget: string | null;
  /** Reason for category assignment from LLM */
  categoryReason: string | null;
  /** Reason for budget assignment from LLM */
  budgetReason: string | null;
  /** New categorization status */
  status: CategorizationStatus;
}

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
  abstract saveManyAndReturn(
    transactions: Transaction[],
  ): Promise<Transaction[]>;
  abstract updateMany(transactions: Transaction[]): Promise<void>;
  abstract updateCategorization(
    externalId: string,
    data: CategorizationUpdate,
  ): Promise<void>;
  abstract findByCategorizationStatus(
    status: CategorizationStatus,
  ): Promise<Transaction[]>;
  abstract findUncategorized(): Promise<Transaction[]>;
}
