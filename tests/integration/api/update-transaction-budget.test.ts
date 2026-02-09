/**
 * API Integration Tests for Update Transaction Budget Mutation
 *
 * Tests the GraphQL updateTransactionBudget mutation.
 *
 * Run with: bun test tests/integration/api/update-transaction-budget.test.ts
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
  createTestBudget,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: updateTransactionBudget', () => {
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

  test('should update transaction budget', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries Budget',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      budgetId: null,
    });

    const result = await harness.executeQuery<{
      updateTransactionBudget: {
        id: number;
        budget: { id: number; name: string } | null;
        categorizationStatus: string;
      };
    }>(
      `
      mutation UpdateTransactionBudget($input: UpdateTransactionBudgetInput!) {
        updateTransactionBudget(input: $input) {
          id
          budget {
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
          budgetId: budget.id,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateTransactionBudget.budget?.name).toBe(
      'Groceries Budget',
    );
    // Should auto-verify when user sets budget
    expect(result.data?.updateTransactionBudget.categorizationStatus).toBe(
      'VERIFIED',
    );
  });
});
