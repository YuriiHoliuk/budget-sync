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
  budgets,
  categories,
  transactions,
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
  type?: 'spending' | 'savings' | 'goal';
  currency?: string;
  targetAmount?: number;
  targetCadence?: 'monthly' | 'weekly' | 'yearly' | null;
  targetCadenceMonths?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isArchived?: boolean;
}

function getDefaultBudgetValues() {
  return {
    name: `Test Budget ${Date.now()}`,
    type: 'spending' as const,
    currency: 'UAH',
    targetAmount: 500000, // 5000.00 UAH
    targetCadence: null,
    targetCadenceMonths: null,
    targetDate: null,
    startDate: null,
    endDate: null,
    isArchived: false,
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
export async function clearAllTestData(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE allocations, transactions, budgets, categories, accounts RESTART IDENTITY CASCADE`,
  );
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
    type: 'spending',
    targetAmount: 1000000,
  });
  const savingsBudget = await createTestBudget(db, {
    name: 'Emergency Fund',
    type: 'savings',
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
