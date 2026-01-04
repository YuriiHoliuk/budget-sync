import { mock } from 'bun:test';
import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { Logger } from '@modules/logging';

/**
 * Creates a mock BankGateway with default implementations that return empty arrays.
 * Override individual methods as needed for specific test scenarios.
 */
export function createMockBankGateway(
  overrides: Partial<{
    getAccounts: () => Promise<Account[]>;
    getTransactions: (
      accountId: string,
      from: Date,
      to: Date,
    ) => Promise<Transaction[]>;
  }> = {},
): BankGateway {
  return {
    getAccounts: overrides.getAccounts ?? mock(() => Promise.resolve([])),
    getTransactions:
      overrides.getTransactions ??
      mock(() => Promise.resolve([] as Transaction[])),
  } as unknown as BankGateway;
}

/**
 * Creates a mock AccountRepository with default implementations.
 * All find methods return null/empty, all mutation methods resolve successfully.
 */
export function createMockAccountRepository(
  overrides: Partial<{
    findById: (id: string) => Promise<Account | null>;
    findByExternalId: (externalId: string) => Promise<Account | null>;
    findByIban: (iban: string) => Promise<Account | null>;
    findByBank: (bank: string) => Promise<Account[]>;
    findAll: () => Promise<Account[]>;
    save: (account: Account) => Promise<void>;
    update: (account: Account) => Promise<void>;
    delete: (id: string) => Promise<void>;
    updateLastSyncTime: (accountId: string, timestamp: number) => Promise<void>;
  }> = {},
): AccountRepository {
  return {
    findById: overrides.findById ?? mock(() => Promise.resolve(null)),
    findByExternalId:
      overrides.findByExternalId ?? mock(() => Promise.resolve(null)),
    findByIban: overrides.findByIban ?? mock(() => Promise.resolve(null)),
    findByBank: overrides.findByBank ?? mock(() => Promise.resolve([])),
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
    save: overrides.save ?? mock(() => Promise.resolve()),
    update: overrides.update ?? mock(() => Promise.resolve()),
    delete: overrides.delete ?? mock(() => Promise.resolve()),
    updateLastSyncTime:
      overrides.updateLastSyncTime ?? mock(() => Promise.resolve()),
  } as unknown as AccountRepository;
}

/**
 * Creates a mock TransactionRepository with default implementations.
 * All find methods return null/empty, all mutation methods resolve successfully.
 */
export function createMockTransactionRepository(
  overrides: Partial<{
    findById: (id: string) => Promise<Transaction | null>;
    findByExternalId: (externalId: string) => Promise<Transaction | null>;
    findByExternalIds: (
      externalIds: string[],
    ) => Promise<Map<string, Transaction>>;
    findByAccountId: (accountId: string) => Promise<Transaction[]>;
    findAll: () => Promise<Transaction[]>;
    save: (transaction: Transaction) => Promise<void>;
    update: (transaction: Transaction) => Promise<void>;
    delete: (id: string) => Promise<void>;
    saveMany: (transactions: Transaction[]) => Promise<void>;
  }> = {},
): TransactionRepository {
  return {
    findById: overrides.findById ?? mock(() => Promise.resolve(null)),
    findByExternalId:
      overrides.findByExternalId ?? mock(() => Promise.resolve(null)),
    findByExternalIds:
      overrides.findByExternalIds ??
      mock(() => Promise.resolve(new Map<string, Transaction>())),
    findByAccountId:
      overrides.findByAccountId ?? mock(() => Promise.resolve([])),
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
    save: overrides.save ?? mock(() => Promise.resolve()),
    update: overrides.update ?? mock(() => Promise.resolve()),
    delete: overrides.delete ?? mock(() => Promise.resolve()),
    saveMany: overrides.saveMany ?? mock(() => Promise.resolve()),
  } as unknown as TransactionRepository;
}

/**
 * Creates a mock Logger with all methods as no-op mocks.
 */
export function createMockLogger(): Logger {
  return {
    info: mock(() => undefined),
    debug: mock(() => undefined),
    warn: mock(() => undefined),
    error: mock(() => undefined),
  } as unknown as Logger;
}
