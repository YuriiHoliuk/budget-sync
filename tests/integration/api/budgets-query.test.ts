/**
 * API Integration Tests for Budgets Query
 *
 * Tests the GraphQL budgets query against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: just test-api-file tests/integration/api/budgets-query.test.ts
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
import { clearAllTestData, createTestBudget } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Query: budgets', () => {
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

  test('should return empty array when no budgets exist', async () => {
    const result = await harness.executeQuery<{ budgets: unknown[] }>(`
      query {
        budgets {
          id
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgets).toEqual([]);
  });

  test('should return all active budgets', async () => {
    await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      type: 'spending',
    });
    await createTestBudget(harness.getDb(), {
      name: 'Emergency Fund',
      type: 'savings',
    });

    const result = await harness.executeQuery<{
      budgets: Array<{ id: number; name: string; type: string }>;
    }>(`
      query {
        budgets {
          id
          name
          type
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgets).toHaveLength(2);

    const names = result.data?.budgets.map((budget) => budget.name);
    expect(names).toContain('Groceries');
    expect(names).toContain('Emergency Fund');
  });

  test('should return budget with all fields', async () => {
    await createTestBudget(harness.getDb(), {
      name: 'Vacation Fund',
      type: 'goal',
      targetAmount: 10000000, // 100,000 UAH in minor units
      targetCadence: 'monthly',
      targetCadenceMonths: 6,
      targetDate: '2026-08-01',
      startDate: '2026-02-01',
      currency: 'UAH',
    });

    const result = await harness.executeQuery<{
      budgets: Array<{
        id: number;
        name: string;
        type: string;
        currency: string;
        targetAmount: number;
        targetCadence: string | null;
        targetCadenceMonths: number | null;
        targetDate: string | null;
        startDate: string | null;
        isArchived: boolean;
      }>;
    }>(`
      query {
        budgets {
          id
          name
          type
          currency
          targetAmount
          targetCadence
          targetCadenceMonths
          targetDate
          startDate
          isArchived
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgets).toHaveLength(1);

    const budget = result.data?.budgets[0];
    expect(budget?.name).toBe('Vacation Fund');
    expect(budget?.type).toBe('GOAL');
    expect(budget?.targetAmount).toBe(100000); // major units
    expect(budget?.targetCadence).toBe('MONTHLY');
    expect(budget?.targetCadenceMonths).toBe(6);
    expect(budget?.isArchived).toBe(false);
  });

  test('should exclude archived budgets by default', async () => {
    await createTestBudget(harness.getDb(), {
      name: 'Active Budget',
      isArchived: false,
    });
    await createTestBudget(harness.getDb(), {
      name: 'Archived Budget',
      isArchived: true,
    });

    const result = await harness.executeQuery<{
      budgets: Array<{ name: string }>;
    }>(`
      query {
        budgets(activeOnly: true) {
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgets).toHaveLength(1);
    expect(result.data?.budgets[0]?.name).toBe('Active Budget');
  });

  test('should include archived budgets when activeOnly is false', async () => {
    await createTestBudget(harness.getDb(), {
      name: 'Active Budget',
      isArchived: false,
    });
    await createTestBudget(harness.getDb(), {
      name: 'Archived Budget',
      isArchived: true,
    });

    const result = await harness.executeQuery<{
      budgets: Array<{ name: string }>;
    }>(`
      query {
        budgets(activeOnly: false) {
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgets).toHaveLength(2);
  });
});
