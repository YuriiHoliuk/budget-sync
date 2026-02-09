/**
 * API Integration Tests for Delete Allocation Mutation
 *
 * Tests the GraphQL deleteAllocation mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/delete-allocation.test.ts
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

describe('Mutation: deleteAllocation', () => {
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

  test('should delete an allocation', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const allocation = await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      deleteAllocation: boolean;
    }>(
      `
      mutation DeleteAllocation($id: Int!) {
        deleteAllocation(id: $id)
      }
    `,
      { id: allocation.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteAllocation).toBe(true);

    // Verify allocation is deleted
    const listResult = await harness.executeQuery<{
      allocations: Array<{ id: number }>;
    }>(`
      query {
        allocations {
          id
        }
      }
    `);

    expect(listResult.data?.allocations).toHaveLength(0);
  });
});
