/**
 * API Integration Tests for Allocations Query
 *
 * Tests the GraphQL allocations query (list) against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/allocations-query.test.ts
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

describe('Query: allocations', () => {
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

  test('should return empty array when no allocations exist', async () => {
    const result = await harness.executeQuery<{ allocations: unknown[] }>(`
      query {
        allocations {
          id
          amount
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations).toEqual([]);
  });

  test('should return all allocations', async () => {
    const budget1 = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const budget2 = await createTestBudget(harness.getDb(), {
      name: 'Transport',
    });

    await createTestAllocation(harness.getDb(), {
      budgetId: budget1.id,
      amount: 500000, // 5000 UAH
      period: '2026-02',
    });
    await createTestAllocation(harness.getDb(), {
      budgetId: budget2.id,
      amount: 200000, // 2000 UAH
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      allocations: Array<{ id: number; amount: number; budgetId: number }>;
    }>(`
      query {
        allocations {
          id
          amount
          budgetId
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations).toHaveLength(2);
  });

  test('should return allocation with all fields', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      currency: 'UAH',
    });

    await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000, // 5000 UAH in minor units
      period: '2026-02',
      date: '2026-02-01',
      notes: 'Monthly groceries budget',
    });

    const result = await harness.executeQuery<{
      allocations: Array<{
        id: number;
        budgetId: number;
        amount: number;
        currency: string;
        period: string;
        date: string;
        notes: string | null;
      }>;
    }>(`
      query {
        allocations {
          id
          budgetId
          amount
          currency
          period
          date
          notes
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations).toHaveLength(1);

    const allocation = result.data?.allocations[0];
    expect(allocation?.amount).toBe(5000); // major units
    expect(allocation?.currency).toBe('UAH');
    expect(allocation?.period).toBe('2026-02');
    expect(allocation?.notes).toBe('Monthly groceries budget');
  });

  test('should filter allocations by budgetId', async () => {
    const budget1 = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });
    const budget2 = await createTestBudget(harness.getDb(), {
      name: 'Transport',
    });

    await createTestAllocation(harness.getDb(), {
      budgetId: budget1.id,
      amount: 500000,
      period: '2026-02',
    });
    await createTestAllocation(harness.getDb(), {
      budgetId: budget2.id,
      amount: 200000,
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      allocations: Array<{ id: number; budgetId: number }>;
    }>(
      `
      query GetAllocations($budgetId: Int) {
        allocations(budgetId: $budgetId) {
          id
          budgetId
        }
      }
    `,
      { budgetId: budget1.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations).toHaveLength(1);
    expect(result.data?.allocations[0]?.budgetId).toBe(budget1.id);
  });

  test('should filter allocations by period', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });

    await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
    });
    await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 600000,
      period: '2026-03',
    });

    const result = await harness.executeQuery<{
      allocations: Array<{ id: number; period: string; amount: number }>;
    }>(
      `
      query GetAllocations($period: String) {
        allocations(period: $period) {
          id
          period
          amount
        }
      }
    `,
      { period: '2026-02' },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations).toHaveLength(1);
    expect(result.data?.allocations[0]?.period).toBe('2026-02');
    expect(result.data?.allocations[0]?.amount).toBe(5000);
  });

  test('should resolve budget child field', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      type: 'spending',
    });

    await createTestAllocation(harness.getDb(), {
      budgetId: budget.id,
      amount: 500000,
      period: '2026-02',
    });

    const result = await harness.executeQuery<{
      allocations: Array<{
        id: number;
        budget: { id: number; name: string; type: string };
      }>;
    }>(`
      query {
        allocations {
          id
          budget {
            id
            name
            type
          }
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.allocations[0]?.budget.name).toBe('Groceries');
    expect(result.data?.allocations[0]?.budget.type).toBe('SPENDING');
  });
});
