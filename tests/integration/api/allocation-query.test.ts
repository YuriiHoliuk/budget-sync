/**
 * API Integration Tests for Allocation Query
 *
 * Tests the GraphQL allocation query (single by id) against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/allocation-query.test.ts
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

describe('Query: allocation', () => {
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

  test('should return single allocation by id', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const allocation = await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      allocation: { id: number; amount: number } | null;
    }>(
      `
      query GetAllocation($id: Int!) {
        allocation(id: $id) {
          id
          amount
        }
      }
    `,
      { id: allocation.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocation?.amount).toBe(5000);
  });

  test('should return null for non-existent allocation', async () => {
    const result = await harness.executeQuery<{
      allocation: { id: number } | null;
    }>(
      `
      query GetAllocation($id: Int!) {
        allocation(id: $id) {
          id
        }
      }
    `,
      { id: 99999 },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocation).toBeNull();
  });
});
