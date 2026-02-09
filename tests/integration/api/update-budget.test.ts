/**
 * API Integration Tests for Update Budget Mutation
 *
 * Tests the GraphQL updateBudget mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: just test-api-file tests/integration/api/update-budget.test.ts
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

describe('Mutation: updateBudget', () => {
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

  test('should update budget name', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Old Name',
    });

    const result = await harness.executeQuery<{
      updateBudget: { id: number; name: string };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          name
        }
      }
    `,
      {
        input: {
          id: budget.id,
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.name).toBe('New Name');
  });

  test('should update budget target amount', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      targetAmount: 500000, // 5000 UAH in minor units
    });

    const result = await harness.executeQuery<{
      updateBudget: { id: number; targetAmount: number };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          targetAmount
        }
      }
    `,
      {
        input: {
          id: budget.id,
          targetAmount: 8000, // major units
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.targetAmount).toBe(8000);
  });

  test('should update multiple fields at once', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
      type: 'spending',
      targetAmount: 100000,
    });

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        name: string;
        targetAmount: number;
        targetCadence: string | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          name
          targetAmount
          targetCadence
        }
      }
    `,
      {
        input: {
          id: budget.id,
          name: 'Updated Budget',
          targetAmount: 15000,
          targetCadence: 'MONTHLY',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.name).toBe('Updated Budget');
    expect(result.data?.updateBudget.targetAmount).toBe(15000);
    expect(result.data?.updateBudget.targetCadence).toBe('MONTHLY');
  });
});
