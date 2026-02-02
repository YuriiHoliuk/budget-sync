import { Account } from '@domain/entities/Account.ts';
import {
  Allocation,
  type AllocationProps,
} from '@domain/entities/Allocation.ts';
import { Budget, type BudgetProps } from '@domain/entities/Budget.ts';
import { Category, type CategoryProps } from '@domain/entities/Category.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import { CategoryStatus } from '@domain/value-objects/CategoryStatus.ts';
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
  date: new Date(),
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
  earliestSyncDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  syncOverlapMs: 0,
} as const;

/**
 * Default test options with standard values for SyncTransactions.
 */
export const DEFAULT_SYNC_OPTIONS = {
  requestDelayMs: 0,
  maxRetries: 3,
  initialBackoffMs: 0,
  earliestSyncDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
  syncOverlapMs: 600000,
} as const;

/**
 * Type for Monobank statement item used in tests.
 */
export interface TestStatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

/**
 * Default values for test Monobank statement items (used in webhooks).
 */
const DEFAULT_STATEMENT_ITEM: TestStatementItem = {
  id: 'stmt-123',
  time: Math.floor(Date.now() / 1000),
  description: 'Test Transaction',
  mcc: 5411, // Grocery stores
  originalMcc: 5411,
  hold: false,
  amount: -5000, // -50.00 UAH
  operationAmount: -5000,
  currencyCode: 980, // UAH
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 100000, // 1000.00 UAH
};

/**
 * Creates a test Monobank statement item for webhook tests.
 * Override any property as needed for specific test scenarios.
 */
export function createTestStatementItem(
  overrides: Partial<TestStatementItem> = {},
): TestStatementItem {
  return {
    ...DEFAULT_STATEMENT_ITEM,
    ...overrides,
  };
}

/**
 * Creates a valid webhook payload for testing.
 * Override any property as needed for specific test scenarios.
 */
export function createTestWebhookPayload(
  overrides: {
    account?: string;
    statementItem?: Partial<TestStatementItem>;
  } = {},
) {
  return {
    type: 'StatementItem' as const,
    data: {
      account: overrides.account ?? 'acc-123',
      statementItem: createTestStatementItem(overrides.statementItem),
    },
  };
}

/**
 * Type for queued webhook transaction DTO in tests.
 */
export interface TestQueuedWebhookTransactionDTO {
  accountExternalId: string;
  newBalanceAmount: number;
  newBalanceCurrencyCode: number;
  transaction: {
    externalId: string;
    date: string;
    amount: number;
    currencyCode: number;
    operationAmount: number;
    operationCurrencyCode: number;
    description: string;
    type: 'CREDIT' | 'DEBIT';
    mcc: number;
    hold: boolean;
    balanceAmount: number;
    comment?: string;
    counterpartyName?: string;
    counterpartyIban?: string;
    cashbackAmount?: number;
    commissionRate?: number;
    originalMcc?: number;
    receiptId?: string;
    invoiceId?: string;
    counterEdrpou?: string;
  };
}

/**
 * Default values for queued webhook transaction DTO.
 */
const DEFAULT_QUEUED_TRANSACTION: TestQueuedWebhookTransactionDTO = {
  accountExternalId: 'acc-123',
  newBalanceAmount: 100000,
  newBalanceCurrencyCode: 980,
  transaction: {
    externalId: 'tx-123',
    date: new Date().toISOString(),
    amount: -5000,
    currencyCode: 980,
    operationAmount: -5000,
    operationCurrencyCode: 980,
    description: 'Test Transaction',
    type: 'DEBIT',
    mcc: 5411,
    hold: false,
    balanceAmount: 100000,
  },
};

/**
 * Creates a test queued webhook transaction DTO.
 * Override any property as needed for specific test scenarios.
 */
export function createTestQueuedTransaction(
  overrides: Partial<{
    accountExternalId: string;
    newBalanceAmount: number;
    newBalanceCurrencyCode: number;
    transaction: Partial<TestQueuedWebhookTransactionDTO['transaction']>;
  }> = {},
): TestQueuedWebhookTransactionDTO {
  return {
    ...DEFAULT_QUEUED_TRANSACTION,
    ...overrides,
    transaction: {
      ...DEFAULT_QUEUED_TRANSACTION.transaction,
      ...overrides.transaction,
    },
  };
}

/**
 * Default values for test Allocation entities.
 */
const DEFAULT_ALLOCATION_PROPS: AllocationProps = {
  budgetId: 1,
  amount: Money.create(500000, Currency.UAH),
  period: '2026-02',
  date: new Date('2026-02-01'),
  notes: null,
  dbId: 1,
};

/**
 * Creates a test Allocation entity with sensible defaults.
 * Override any property as needed for specific test scenarios.
 */
export function createTestAllocation(
  overrides: Partial<AllocationProps> = {},
): Allocation {
  return Allocation.create({
    ...DEFAULT_ALLOCATION_PROPS,
    ...overrides,
  });
}

/**
 * Default values for test Budget entities.
 */
const DEFAULT_BUDGET_PROPS: BudgetProps = {
  name: 'Test Budget',
  type: 'spending',
  amount: Money.create(1000000, Currency.UAH),
  targetCadence: null,
  targetCadenceMonths: null,
  targetDate: null,
  startDate: null,
  endDate: null,
  isArchived: false,
  dbId: 1,
};

/**
 * Creates a test Budget entity with sensible defaults.
 * Override any property as needed for specific test scenarios.
 */
export function createTestBudget(overrides: Partial<BudgetProps> = {}): Budget {
  return Budget.create({
    ...DEFAULT_BUDGET_PROPS,
    ...overrides,
  });
}

/**
 * Default values for test Category entities.
 */
const DEFAULT_CATEGORY_PROPS: CategoryProps = {
  name: 'Test Category',
  status: CategoryStatus.ACTIVE,
  dbId: 1,
};

/**
 * Creates a test Category entity with sensible defaults.
 * Override any property as needed for specific test scenarios.
 */
export function createTestCategory(
  overrides: Partial<CategoryProps> = {},
): Category {
  return Category.create({
    ...DEFAULT_CATEGORY_PROPS,
    ...overrides,
  });
}
