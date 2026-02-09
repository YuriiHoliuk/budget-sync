/**
 * API Integration Tests for Update Transaction Category Mutation
 *
 * Tests the GraphQL updateTransactionCategory mutation.
 *
 * Run with: bun test tests/integration/api/update-transaction-category.test.ts
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
import {
  clearAllTestData,
  createTestAccount,
  createTestCategory,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: updateTransactionCategory', () => {
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

  test('should update transaction category', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: null,
    });

    const result = await harness.executeQuery<{
      updateTransactionCategory: {
        id: number;
        category: { id: number; name: string } | null;
        categorizationStatus: string;
      };
    }>(
      `
      mutation UpdateTransactionCategory($input: UpdateTransactionCategoryInput!) {
        updateTransactionCategory(input: $input) {
          id
          category {
            id
            name
          }
          categorizationStatus
        }
      }
    `,
      {
        input: {
          id: transaction.id,
          categoryId: category.id,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateTransactionCategory.category?.name).toBe(
      'Groceries',
    );
    // Should auto-verify when user sets category
    expect(result.data?.updateTransactionCategory.categorizationStatus).toBe(
      'VERIFIED',
    );
  });

  test('should clear transaction category', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categoryId: category.id,
    });

    const result = await harness.executeQuery<{
      updateTransactionCategory: {
        id: number;
        category: { id: number } | null;
      };
    }>(
      `
      mutation UpdateTransactionCategory($input: UpdateTransactionCategoryInput!) {
        updateTransactionCategory(input: $input) {
          id
          category {
            id
          }
        }
      }
    `,
      {
        input: {
          id: transaction.id,
          categoryId: null,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateTransactionCategory.category).toBeNull();
  });
});
