import type { BankTransaction } from '../entities/BankTransaction.ts';

/**
 * Injection token for BankTransactionRepository.
 * Use with @inject(BANK_TRANSACTION_REPOSITORY_TOKEN) in classes that depend on BankTransactionRepository.
 */
export const BANK_TRANSACTION_REPOSITORY_TOKEN = Symbol(
  'BankTransactionRepository',
);

/**
 * Repository for raw bank transaction data.
 * Manages the bank_transactions table which stores original, unmodified bank records.
 */
export abstract class BankTransactionRepository {
  abstract save(bankTransaction: BankTransaction): Promise<BankTransaction>;
  abstract saveMany(
    bankTransactions: BankTransaction[],
  ): Promise<BankTransaction[]>;
  abstract findByExternalId(
    externalId: string,
  ): Promise<BankTransaction | null>;
  abstract findByExternalIds(
    externalIds: string[],
  ): Promise<Map<string, BankTransaction>>;
  abstract findByAccountAndDateRange(
    accountId: number,
    from: Date,
    to: Date,
  ): Promise<BankTransaction[]>;
  abstract findByTransactionId(
    transactionId: number,
  ): Promise<BankTransaction[]>;
  abstract linkTransactionSource(
    transactionId: number,
    bankTransactionId: number,
  ): Promise<void>;
  abstract linkTransactionSources(
    links: Array<{ transactionId: number; bankTransactionId: number }>,
  ): Promise<void>;
}
