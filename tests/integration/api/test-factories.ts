/**
 * Test Data Factories for API Integration Tests
 *
 * Provides functions to seed test data directly into the database.
 * Uses Drizzle ORM for type-safe database operations.
 *
 * All factory functions:
 * - Accept a database instance (from TestHarness.getDb())
 * - Return the created record(s) with database IDs
 * - Support partial overrides for test-specific values
 */

import type * as schema from '@modules/database/schema/index.ts';
import {
  accounts,
  allocations,
  bankTransactions,
  budgetizationRules,
  budgets,
  budgetTargets,
  categories,
  categorizationRules,
  transactionSources,
  transactions,
  transferPairs,
} from '@modules/database/schema/index.ts';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Account factory - creates test accounts
 */
interface TestAccountData {
  externalId?: string;
  name?: string;
  externalName?: string;
  type?: 'debit' | 'credit' | 'fop';
  currency?: string;
  balance?: number;
  initialBalance?: number | null;
  role?: 'operational' | 'savings';
  iban?: string;
  bank?: string;
  source?: 'bank_sync' | 'manual';
  isArchived?: boolean;
}

let accountCounter = 0;

function getDefaultAccountValues() {
  accountCounter++;
  const uniqueId = `${Date.now()}-${accountCounter}`;
  const balance = 100000; // 1000.00 UAH
  return {
    externalId: `test-acc-${uniqueId}`,
    name: 'Test Account',
    externalName: 'Test Account',
    type: 'debit' as const,
    currency: 'UAH',
    balance,
    initialBalance: balance, // For flow-based calculation
    role: 'operational' as const,
    iban: `UA${uniqueId.padStart(27, '0')}`,
    bank: 'monobank',
    source: 'bank_sync' as const,
    isArchived: false,
  };
}

export async function createTestAccount(
  db: Db,
  overrides: TestAccountData = {},
) {
  const defaults = getDefaultAccountValues();
  const name = overrides.name ?? defaults.name;
  const balance = overrides.balance ?? defaults.balance;
  const values = {
    ...defaults,
    ...overrides,
    name,
    externalName: overrides.externalName ?? name,
    balance,
    // Default initialBalance to balance if not explicitly set
    initialBalance:
      overrides.initialBalance !== undefined
        ? overrides.initialBalance
        : balance,
  };

  const [result] = await db.insert(accounts).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test account');
  }
  return result;
}

/**
 * Category factory - creates test categories
 */
interface TestCategoryData {
  name?: string;
  status?: 'active' | 'archived';
  parentId?: number | null;
}

export async function createTestCategory(
  db: Db,
  overrides: TestCategoryData = {},
) {
  const values = {
    name: overrides.name ?? `Test Category ${Date.now()}`,
    status: overrides.status ?? 'active',
    parentId: overrides.parentId ?? null,
  };

  const [result] = await db.insert(categories).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test category');
  }
  return result;
}

/**
 * Budget factory - creates test budgets
 */
interface TestBudgetData {
  name?: string;
  currency?: string;
  targetAmount?: number;
  cadenceUnit?: 'day' | 'week' | 'month' | 'year' | null;
  cadenceCount?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cap?: number | null;
  isArchived?: boolean;
  sortOrder?: string | null;
  budgetGroupId?: number | null;
}

let budgetCounter = 0;

function getDefaultBudgetValues() {
  budgetCounter++;
  return {
    name: `Test Budget ${Date.now()}`,
    currency: 'UAH',
    targetAmount: 500000, // 5000.00 UAH
    cadenceUnit: null,
    cadenceCount: null,
    targetDate: null,
    startDate: null,
    endDate: null,
    cap: null,
    isArchived: false,
    sortOrder: `a${budgetCounter}`, // Default sortOrder for test budgets
  };
}

export async function createTestBudget(db: Db, overrides: TestBudgetData = {}) {
  const values = { ...getDefaultBudgetValues(), ...overrides };

  const [result] = await db.insert(budgets).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test budget');
  }
  return result;
}

/**
 * Allocation factory - creates test allocations
 */
interface TestAllocationData {
  budgetId: number;
  amount?: number;
  period?: string;
  date?: string;
  notes?: string | null;
}

export async function createTestAllocation(db: Db, data: TestAllocationData) {
  const values = {
    budgetId: data.budgetId,
    amount: data.amount ?? 500000, // 5000.00 UAH
    period: data.period ?? '2026-02',
    date: data.date ?? '2026-02-01',
    notes: data.notes ?? null,
  };

  const [result] = await db.insert(allocations).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test allocation');
  }
  return result;
}

/**
 * Transaction factory - creates test transactions
 */
interface TestTransactionData {
  accountId: number;
  accountExternalId?: string | null;
  externalId?: string;
  date?: Date;
  amount?: number;
  currency?: string;
  type?: 'debit' | 'credit';
  categoryId?: number | null;
  budgetId?: number | null;
  categorizationStatus?: 'pending' | 'categorized' | 'verified';
  counterparty?: string;
  bankDescription?: string;
  mcc?: number;
  notes?: string | null;
}

function getDefaultTransactionValues(accountId: number) {
  return {
    accountId,
    accountExternalId: `ext-${accountId}`,
    externalId: `test-tx-${Date.now()}`,
    date: new Date(),
    amount: -15000, // -150.00 UAH (expense)
    currency: 'UAH',
    type: 'debit' as const,
    categoryId: null,
    budgetId: null,
    categorizationStatus: 'pending' as const,
    counterparty: 'Test Counterparty',
    bankDescription: 'Test Description',
    mcc: 5411,
  };
}

export async function createTestTransaction(db: Db, data: TestTransactionData) {
  const values = { ...getDefaultTransactionValues(data.accountId), ...data };

  const [result] = await db.insert(transactions).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test transaction');
  }
  return result;
}

/**
 * Clear all test data from the database.
 * Use in beforeEach/afterEach to ensure clean state.
 */
/**
 * Budget target factory - creates test budget target history entries
 */
interface TestBudgetTargetData {
  budgetId: number;
  targetAmount: number;
  effectiveFrom: string;
}

export async function createTestBudgetTarget(
  db: Db,
  data: TestBudgetTargetData,
) {
  const [result] = await db
    .insert(budgetTargets)
    .values({
      budgetId: data.budgetId,
      targetAmount: data.targetAmount,
      effectiveFrom: data.effectiveFrom,
    })
    .returning();
  if (!result) {
    throw new Error('Failed to create test budget target');
  }
  return result;
}

/**
 * Bank transaction factory - creates test bank transactions
 */
interface TestBankTransactionData {
  externalId?: string;
  accountId: number;
  date?: Date;
  amount?: number;
  currency?: string;
  type?: string;
  bankDescription?: string;
  counterparty?: string;
  mcc?: number;
  commission?: number;
}

export async function createTestBankTransaction(
  db: Db,
  data: TestBankTransactionData,
) {
  const values = {
    externalId: data.externalId ?? `test-btx-${Date.now()}-${Math.random()}`,
    accountId: data.accountId,
    date: data.date ?? new Date(),
    amount: data.amount ?? -15000,
    currency: data.currency ?? 'UAH',
    type: data.type ?? 'debit',
    bankDescription: data.bankDescription ?? 'Test Description',
    counterparty: data.counterparty ?? 'Test Counterparty',
    mcc: data.mcc ?? 5411,
    commission: data.commission ?? 0,
  };

  const [result] = await db.insert(bankTransactions).values(values).returning();
  if (!result) {
    throw new Error('Failed to create test bank transaction');
  }
  return result;
}

/**
 * Transaction source factory - links a transaction to a bank transaction
 */
export async function createTestTransactionSource(
  db: Db,
  data: { transactionId: number; bankTransactionId: number },
) {
  const [result] = await db.insert(transactionSources).values(data).returning();
  if (!result) {
    throw new Error('Failed to create test transaction source');
  }
  return result;
}

/**
 * Transfer pair factory - creates a transfer pair between two transactions
 */
export async function createTestTransferPair(
  db: Db,
  data: { outgoingTransactionId: number; incomingTransactionId: number },
) {
  const [result] = await db.insert(transferPairs).values(data).returning();
  if (!result) {
    throw new Error('Failed to create test transfer pair');
  }
  return result;
}

export async function clearAllTestData(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE transfer_pairs, transaction_sources, bank_transactions, allocations, transactions, budget_targets, budgets, budget_groups, categories, accounts, categorization_rules, budgetization_rules RESTART IDENTITY CASCADE`,
  );
}

/**
 * Rule factories - creates test categorization/budgetization rules
 */
interface TestRuleData {
  rule?: string;
  priority?: number;
}

export async function createTestCategorizationRule(
  db: Db,
  overrides: TestRuleData = {},
) {
  const values = {
    rule: overrides.rule ?? `Test categorization rule ${Date.now()}`,
    priority: overrides.priority ?? 0,
  };

  const [result] = await db
    .insert(categorizationRules)
    .values(values)
    .returning();
  if (!result) {
    throw new Error('Failed to create test categorization rule');
  }
  return result;
}

export async function createTestBudgetizationRule(
  db: Db,
  overrides: TestRuleData = {},
) {
  const values = {
    rule: overrides.rule ?? `Test budgetization rule ${Date.now()}`,
    priority: overrides.priority ?? 0,
  };

  const [result] = await db
    .insert(budgetizationRules)
    .values(values)
    .returning();
  if (!result) {
    throw new Error('Failed to create test budgetization rule');
  }
  return result;
}

/**
 * Seed a minimal test dataset.
 * Creates: 2 accounts, 3 categories, 2 budgets, 2 allocations, 5 transactions.
 */
export async function seedMinimalTestData(db: Db) {
  // Accounts
  const operationalAccount = await createTestAccount(db, {
    name: 'Operational Account',
    role: 'operational',
  });
  const savingsAccount = await createTestAccount(db, {
    name: 'Savings Account',
    role: 'savings',
  });

  // Categories (parent + children)
  const foodCategory = await createTestCategory(db, { name: 'Food' });
  const groceriesCategory = await createTestCategory(db, {
    name: 'Groceries',
    parentId: foodCategory.id,
  });
  const transportCategory = await createTestCategory(db, { name: 'Transport' });

  // Budgets
  const groceriesBudget = await createTestBudget(db, {
    name: 'Groceries',
    targetAmount: 1000000,
  });
  const savingsBudget = await createTestBudget(db, {
    name: 'Emergency Fund',
    targetAmount: 5000000,
  });

  // Allocations for current month
  const currentPeriod = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const groceriesAllocation = await createTestAllocation(db, {
    budgetId: groceriesBudget.id,
    amount: 800000,
    period: currentPeriod,
  });
  const savingsAllocation = await createTestAllocation(db, {
    budgetId: savingsBudget.id,
    amount: 500000,
    period: currentPeriod,
  });

  // Transactions
  const incomeTransaction = await createTestTransaction(db, {
    accountId: operationalAccount.id,
    accountExternalId: operationalAccount.externalId,
    amount: 7500000, // +75000.00 UAH income
    type: 'credit',
    categorizationStatus: 'verified',
  });

  const groceryTransaction1 = await createTestTransaction(db, {
    accountId: operationalAccount.id,
    accountExternalId: operationalAccount.externalId,
    amount: -35000, // -350.00 UAH
    categoryId: groceriesCategory.id,
    budgetId: groceriesBudget.id,
    categorizationStatus: 'verified',
    counterparty: 'Silpo',
  });

  const groceryTransaction2 = await createTestTransaction(db, {
    accountId: operationalAccount.id,
    accountExternalId: operationalAccount.externalId,
    amount: -28000, // -280.00 UAH
    categoryId: groceriesCategory.id,
    budgetId: groceriesBudget.id,
    categorizationStatus: 'pending',
    counterparty: 'ATB',
  });

  const transportTransaction = await createTestTransaction(db, {
    accountId: operationalAccount.id,
    accountExternalId: operationalAccount.externalId,
    amount: -15000, // -150.00 UAH
    categoryId: transportCategory.id,
    categorizationStatus: 'verified',
    counterparty: 'Bolt',
  });

  const uncategorizedTransaction = await createTestTransaction(db, {
    accountId: operationalAccount.id,
    accountExternalId: operationalAccount.externalId,
    amount: -12500, // -125.00 UAH
    categorizationStatus: 'pending',
    counterparty: 'Unknown Shop',
  });

  return {
    accounts: {
      operational: operationalAccount,
      savings: savingsAccount,
    },
    categories: {
      food: foodCategory,
      groceries: groceriesCategory,
      transport: transportCategory,
    },
    budgets: {
      groceries: groceriesBudget,
      savings: savingsBudget,
    },
    allocations: {
      groceries: groceriesAllocation,
      savings: savingsAllocation,
    },
    transactions: {
      income: incomeTransaction,
      grocery1: groceryTransaction1,
      grocery2: groceryTransaction2,
      transport: transportTransaction,
      uncategorized: uncategorizedTransaction,
    },
  };
}
