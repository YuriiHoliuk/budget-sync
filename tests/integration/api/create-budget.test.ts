/**
 * API Integration Tests for Create Budget Mutation
 *
 * Tests the GraphQL createBudget mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: just test-api-file tests/integration/api/create-budget.test.ts
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
import { clearAllTestData } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: createBudget', () => {
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

  test('should create a budget with basic fields', async () => {
    const result = await harness.executeQuery<{
      createBudget: {
        id: number;
        name: string;
        currency: string;
        targetAmount: number;
      };
    }>(
      `
      mutation CreateBudget($input: CreateBudgetInput!) {
        createBudget(input: $input) {
          id
          name
          currency
          targetAmount
        }
      }
    `,
      {
        input: {
          name: 'Restaurants',
          currency: 'UAH',
          targetAmount: 5000,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createBudget.name).toBe('Restaurants');
    expect(result.data?.createBudget.targetAmount).toBe(5000);
  });

  test('should create a budget with target amount', async () => {
    const result = await harness.executeQuery<{
      createBudget: {
        id: number;
        name: string;
        targetAmount: number;
      };
    }>(
      `
      mutation CreateBudget($input: CreateBudgetInput!) {
        createBudget(input: $input) {
          id
          name
          targetAmount
        }
      }
    `,
      {
        input: {
          name: 'Emergency Fund',
          currency: 'UAH',
          targetAmount: 50000,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createBudget.name).toBe('Emergency Fund');
    expect(result.data?.createBudget.targetAmount).toBe(50000);
  });

  test('should create a budget with target date', async () => {
    const result = await harness.executeQuery<{
      createBudget: {
        id: number;
        name: string;
        targetDate: string | null;
        targetAmount: number;
      };
    }>(
      `
      mutation CreateBudget($input: CreateBudgetInput!) {
        createBudget(input: $input) {
          id
          name
          targetDate
          targetAmount
        }
      }
    `,
      {
        input: {
          name: 'New Car',
          currency: 'UAH',
          targetAmount: 500000,
          targetDate: '2027-01-01',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createBudget.name).toBe('New Car');
    expect(result.data?.createBudget.targetDate).toBe('2027-01-01');
  });
});
