/**
 * API Integration Tests for Create Allocation Mutation
 *
 * Tests the GraphQL createAllocation mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/create-allocation.test.ts
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

describe('Mutation: createAllocation', () => {
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

  test('should create an allocation', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      currency: 'UAH',
    });

    const result = await harness.executeQuery<{
      createAllocation: {
        id: number;
        budgetId: number;
        amount: number;
        currency: string;
        period: string;
      };
    }>(
      `
      mutation CreateAllocation($input: CreateAllocationInput!) {
        createAllocation(input: $input) {
          id
          budgetId
          amount
          currency
          period
        }
      }
    `,
      {
        input: {
          budgetId: budget.id,
          amount: 5000, // major units
          currency: 'UAH',
          period: '2026-02',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createAllocation.budgetId).toBe(budget.id);
    expect(result.data?.createAllocation.amount).toBe(5000);
    expect(result.data?.createAllocation.period).toBe('2026-02');
  });

  test('should create allocation with notes', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });

    const result = await harness.executeQuery<{
      createAllocation: {
        id: number;
        notes: string | null;
      };
    }>(
      `
      mutation CreateAllocation($input: CreateAllocationInput!) {
        createAllocation(input: $input) {
          id
          notes
        }
      }
    `,
      {
        input: {
          budgetId: budget.id,
          amount: 5000,
          currency: 'UAH',
          period: '2026-02',
          notes: 'Extra allocation for holidays',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createAllocation.notes).toBe(
      'Extra allocation for holidays',
    );
  });

  test('should allow negative allocations', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });

    const result = await harness.executeQuery<{
      createAllocation: {
        id: number;
        amount: number;
      };
    }>(
      `
      mutation CreateAllocation($input: CreateAllocationInput!) {
        createAllocation(input: $input) {
          id
          amount
        }
      }
    `,
      {
        input: {
          budgetId: budget.id,
          amount: -1000, // negative adjustment
          currency: 'UAH',
          period: '2026-02',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createAllocation.amount).toBe(-1000);
  });
});
