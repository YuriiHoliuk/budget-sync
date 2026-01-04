import { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';

/**
 * Default values for test Account entities.
 */
const DEFAULT_ACCOUNT_PROPS = {
  externalId: 'acc-123',
  name: 'Test Account',
  currency: Currency.UAH,
  balance: Money.create(100000, Currency.UAH),
  type: 'black',
  iban: 'UA123456789012345678901234567',
  maskedPan: ['*1234'],
  bank: 'monobank',
};

/**
 * Creates a test Account entity with sensible defaults.
 * Override any property as needed for specific test scenarios.
 * Use explicit `undefined` to remove optional properties like iban or maskedPan.
 */
export function createTestAccount(
  overrides: Partial<Parameters<typeof Account.create>[0]> = {},
): Account {
  return Account.create({
    ...DEFAULT_ACCOUNT_PROPS,
    ...overrides,
  });
}

/**
 * Default values for test Transaction entities.
 */
const DEFAULT_TRANSACTION_PROPS = {
  externalId: 'tx-123',
  date: new Date('2026-01-01T12:00:00.000Z'),
  amount: Money.create(5000, Currency.UAH),
  description: 'Test Transaction',
  type: TransactionType.DEBIT,
  accountId: 'acc-123',
};

/**
 * Creates a test Transaction entity with sensible defaults.
 * Override any property as needed for specific test scenarios.
 */
export function createTestTransaction(
  overrides: Partial<Parameters<typeof Transaction.create>[0]> = {},
): Transaction {
  return Transaction.create({
    ...DEFAULT_TRANSACTION_PROPS,
    ...overrides,
  });
}

/**
 * Default test options for SyncMonobank and SyncTransactions use cases.
 * Uses minimal delays for fast test execution.
 */
export const FAST_TEST_OPTIONS = {
  requestDelayMs: 0,
  maxRetries: 1,
  initialBackoffMs: 0,
  earliestSyncDate: new Date('2026-01-01'),
  syncOverlapMs: 0,
} as const;

/**
 * Default test options with standard values for SyncTransactions.
 */
export const DEFAULT_SYNC_OPTIONS = {
  requestDelayMs: 0,
  maxRetries: 3,
  initialBackoffMs: 0,
  earliestSyncDate: new Date('2026-01-01'),
  syncOverlapMs: 600000,
} as const;
