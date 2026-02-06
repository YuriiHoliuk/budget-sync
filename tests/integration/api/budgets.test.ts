/**
 * API Integration Tests for Budgets
 *
 * Tests the GraphQL budgets queries and mutations against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/budgets.test.ts
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

describe('Budgets API Integration', () => {
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

  describe('Query: budgets', () => {
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

  describe('Query: budget', () => {
    test('should return single budget by id', async () => {
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
      });

      const result = await harness.executeQuery<{
        budget: { id: number; name: string } | null;
      }>(
        `
        query GetBudget($id: Int!) {
          budget(id: $id) {
            id
            name
          }
        }
      `,
        { id: budget.id },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.budget?.name).toBe('Groceries');
    });

    test('should return null for non-existent budget', async () => {
      const result = await harness.executeQuery<{
        budget: { id: number; name: string } | null;
      }>(
        `
        query GetBudget($id: Int!) {
          budget(id: $id) {
            id
            name
          }
        }
      `,
        { id: 99999 },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.budget).toBeNull();
    });
  });

  describe('Mutation: createBudget', () => {
    test('should create a spending budget', async () => {
      const result = await harness.executeQuery<{
        createBudget: {
          id: number;
          name: string;
          type: string;
          currency: string;
          targetAmount: number;
        };
      }>(
        `
        mutation CreateBudget($input: CreateBudgetInput!) {
          createBudget(input: $input) {
            id
            name
            type
            currency
            targetAmount
          }
        }
      `,
        {
          input: {
            name: 'Restaurants',
            type: 'SPENDING',
            currency: 'UAH',
            targetAmount: 5000,
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudget.name).toBe('Restaurants');
      expect(result.data?.createBudget.type).toBe('SPENDING');
      expect(result.data?.createBudget.targetAmount).toBe(5000);
    });

    test('should create a savings budget', async () => {
      const result = await harness.executeQuery<{
        createBudget: {
          id: number;
          name: string;
          type: string;
          targetAmount: number;
        };
      }>(
        `
        mutation CreateBudget($input: CreateBudgetInput!) {
          createBudget(input: $input) {
            id
            name
            type
            targetAmount
          }
        }
      `,
        {
          input: {
            name: 'Emergency Fund',
            type: 'SAVINGS',
            currency: 'UAH',
            targetAmount: 50000,
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudget.name).toBe('Emergency Fund');
      expect(result.data?.createBudget.type).toBe('SAVINGS');
    });

    test('should create a goal budget with target date', async () => {
      const result = await harness.executeQuery<{
        createBudget: {
          id: number;
          name: string;
          type: string;
          targetDate: string | null;
          targetAmount: number;
        };
      }>(
        `
        mutation CreateBudget($input: CreateBudgetInput!) {
          createBudget(input: $input) {
            id
            name
            type
            targetDate
            targetAmount
          }
        }
      `,
        {
          input: {
            name: 'New Car',
            type: 'GOAL',
            currency: 'UAH',
            targetAmount: 500000,
            targetDate: '2027-01-01',
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudget.name).toBe('New Car');
      expect(result.data?.createBudget.type).toBe('GOAL');
      expect(result.data?.createBudget.targetDate).toBe('2027-01-01');
    });
  });

  describe('Mutation: updateBudget', () => {
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

  describe('Mutation: archiveBudget', () => {
    test('should archive a budget', async () => {
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Budget To Archive',
        isArchived: false,
      });

      const result = await harness.executeQuery<{
        archiveBudget: { id: number; name: string; isArchived: boolean };
      }>(
        `
        mutation ArchiveBudget($id: Int!) {
          archiveBudget(id: $id) {
            id
            name
            isArchived
          }
        }
      `,
        { id: budget.id },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.archiveBudget.id).toBe(budget.id);
      expect(result.data?.archiveBudget.isArchived).toBe(true);

      // Verify budget is no longer in active list
      const listResult = await harness.executeQuery<{
        budgets: Array<{ id: number }>;
      }>(`
        query {
          budgets(activeOnly: true) {
            id
          }
        }
      `);

      expect(listResult.data?.budgets).toHaveLength(0);
    });
  });
});
