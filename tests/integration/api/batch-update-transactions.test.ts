/**
 * API Integration Tests for Batch Update Transactions Mutation
 *
 * Tests the GraphQL batchUpdateTransactions mutation — an atomic multi-row
 * UPDATE over transactions that can change category, budget, and/or
 * verification status for a selection.
 *
 * Run with: bun test tests/integration/api/batch-update-transactions.test.ts
 */

import 'reflect-metadata';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { transactions } from '@modules/database/schema/index.ts';
import { inArray } from 'drizzle-orm';
import {
  clearAllTestData,
  createTestAccount,
  createTestBudget,
  createTestCategory,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const BATCH_UPDATE = `
  mutation BatchUpdateTransactions($input: BatchUpdateTransactionsInput!) {
    batchUpdateTransactions(input: $input) {
      updatedCount
      transactions {
        id
        categorizationStatus
        category {
          id
          name
        }
        budget {
          id
          name
        }
      }
    }
  }
`;

interface BatchUpdateResponse {
  batchUpdateTransactions: {
    updatedCount: number;
    transactions: Array<{
      id: number;
      categorizationStatus: string;
      category: { id: number; name: string } | null;
      budget: { id: number; name: string } | null;
    }>;
  };
}

describe('Mutation: batchUpdateTransactions', () => {
  beforeAll(async () => {
    await harness.setup();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  afterEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  test('batch-updates category across 3 transactions, auto-verifies all', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
      categorizationStatus: 'pending',
    });
    const tx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
      categorizationStatus: 'pending',
    });
    const tx3 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
      categorizationStatus: 'categorized',
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [tx1.id, tx2.id, tx3.id],
          categoryId: category.id,
          setCategory: true,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.batchUpdateTransactions.updatedCount).toBe(3);
    const updated = result.data?.batchUpdateTransactions.transactions ?? [];
    expect(updated).toHaveLength(3);
    for (const txn of updated) {
      expect(txn.category?.name).toBe('Groceries');
      expect(txn.categorizationStatus).toBe('VERIFIED');
    }
  });

  test('batch-updates budget across 2 transactions', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Monthly Food',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      budgetId: null,
    });
    const tx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      budgetId: null,
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [tx1.id, tx2.id],
          budgetId: budget.id,
          setBudget: true,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.batchUpdateTransactions.updatedCount).toBe(2);
    const updated = result.data?.batchUpdateTransactions.transactions ?? [];
    for (const txn of updated) {
      expect(txn.budget?.name).toBe('Monthly Food');
    }
  });

  test('combined category + budget + verify', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Monthly Food',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categorizationStatus: 'pending',
    });
    const tx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categorizationStatus: 'pending',
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [tx1.id, tx2.id],
          categoryId: category.id,
          setCategory: true,
          budgetId: budget.id,
          setBudget: true,
          verify: true,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.batchUpdateTransactions.updatedCount).toBe(2);
    const updated = result.data?.batchUpdateTransactions.transactions ?? [];
    for (const txn of updated) {
      expect(txn.category?.name).toBe('Groceries');
      expect(txn.budget?.name).toBe('Monthly Food');
      expect(txn.categorizationStatus).toBe('VERIFIED');
    }
  });

  test('setCategory with categoryId=null clears category and verifies', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: category.id,
      categorizationStatus: 'categorized',
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [tx1.id],
          categoryId: null,
          setCategory: true,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.batchUpdateTransactions.updatedCount).toBe(1);
    const updated = result.data?.batchUpdateTransactions.transactions[0];
    expect(updated?.category).toBeNull();
    expect(updated?.categorizationStatus).toBe('VERIFIED');
  });

  test('rejects empty ids array', async () => {
    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [],
          setCategory: true,
          categoryId: null,
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toMatch(/at least one/i);
  });

  test('rejects when no fields are set', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: { ids: [tx1.id] },
      },
    );

    expect(result.errors).toBeDefined();
  });

  test('rejects non-existent category and persists nothing', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const tx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
      categorizationStatus: 'pending',
    });
    const tx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
      categorizationStatus: 'pending',
    });

    const result = await harness.executeQuery<BatchUpdateResponse>(
      BATCH_UPDATE,
      {
        input: {
          ids: [tx1.id, tx2.id],
          categoryId: 999_999,
          setCategory: true,
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toMatch(/category not found/i);

    // Nothing persisted — both transactions remain untouched.
    const rows = await harness
      .getDb()
      .select({
        id: transactions.id,
        categoryId: transactions.categoryId,
        status: transactions.categorizationStatus,
      })
      .from(transactions)
      .where(inArray(transactions.id, [tx1.id, tx2.id]));
    for (const row of rows) {
      expect(row.categoryId).toBeNull();
      expect(row.status).toBe('pending');
    }
  });
});
