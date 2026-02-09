/**
 * API Integration Tests for Update Allocation Mutation
 *
 * Tests the GraphQL updateAllocation mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/update-allocation.test.ts
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

describe('Mutation: updateAllocation', () => {
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

  test('should update allocation amount', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const allocation = await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      updateAllocation: { id: number; amount: number };
    }>(
      `
      mutation UpdateAllocation($input: UpdateAllocationInput!) {
        updateAllocation(input: $input) {
          id
          amount
        }
      }
    `,
      {
        input: {
          id: allocation.id,
          amount: 7000, // major units
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateAllocation.amount).toBe(7000);
  });

  test('should update allocation notes', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const allocation = await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
      notes: null,
    });

    const result = await harness.executeQuery<{
      updateAllocation: { id: number; notes: string | null };
    }>(
      `
      mutation UpdateAllocation($input: UpdateAllocationInput!) {
        updateAllocation(input: $input) {
          id
          notes
        }
      }
    `,
      {
        input: {
          id: allocation.id,
          notes: 'Updated notes',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateAllocation.notes).toBe('Updated notes');
  });
});
