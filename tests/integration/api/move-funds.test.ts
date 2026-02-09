/**
 * API Integration Tests for Move Funds Mutation
 *
 * Tests the GraphQL moveFunds mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/move-funds.test.ts
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
  createTestAllocation,
  createTestBudget,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: moveFunds', () => {
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

  test('should move funds between budgets', async () => {
    const sourceBudget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      currency: 'UAH',
    });
    const destBudget = await createTestBudget(harness.getDb(), {
      name: 'Restaurants',
      currency: 'UAH',
    });

    // Create initial allocation for source
    await createTestAllocation(harness.getDb(), {
      budgetId: sourceBudget.id,
      amount: 1000000, // 10000 UAH
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      moveFunds: {
        sourceAllocation: { id: number; amount: number; budgetId: number };
        destAllocation: { id: number; amount: number; budgetId: number };
      };
    }>(
      `
      mutation MoveFunds($input: MoveFundsInput!) {
        moveFunds(input: $input) {
          sourceAllocation {
            id
            amount
            budgetId
          }
          destAllocation {
            id
            amount
            budgetId
          }
        }
      }
    `,
      {
        input: {
          sourceBudgetId: sourceBudget.id,
          destBudgetId: destBudget.id,
          amount: 2000, // 2000 UAH to move
          currency: 'UAH',
          period: '2026-02',
        },
      },
    );

    expect(result.errors).toBeUndefined();

    // Source allocation should be negative (deducted)
    expect(result.data?.moveFunds.sourceAllocation.budgetId).toBe(
      sourceBudget.id,
    );
    expect(result.data?.moveFunds.sourceAllocation.amount).toBe(-2000);

    // Dest allocation should be positive (added)
    expect(result.data?.moveFunds.destAllocation.budgetId).toBe(destBudget.id);
    expect(result.data?.moveFunds.destAllocation.amount).toBe(2000);
  });

  test('should create allocations with notes', async () => {
    const sourceBudget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const destBudget = await createTestBudget(harness.getDb(), {
      name: 'Restaurants',
    });

    const result = await harness.executeQuery<{
      moveFunds: {
        sourceAllocation: { notes: string | null };
        destAllocation: { notes: string | null };
      };
    }>(
      `
      mutation MoveFunds($input: MoveFundsInput!) {
        moveFunds(input: $input) {
          sourceAllocation {
            notes
          }
          destAllocation {
            notes
          }
        }
      }
    `,
      {
        input: {
          sourceBudgetId: sourceBudget.id,
          destBudgetId: destBudget.id,
          amount: 1000,
          currency: 'UAH',
          period: '2026-02',
          notes: 'Moved funds for dinner',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.moveFunds.sourceAllocation.notes).toBe(
      'Moved funds for dinner',
    );
    expect(result.data?.moveFunds.destAllocation.notes).toBe(
      'Moved funds for dinner',
    );
  });
});
