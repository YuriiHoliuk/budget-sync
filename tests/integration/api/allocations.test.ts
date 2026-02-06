/**
 * API Integration Tests for Allocations
 *
 * Tests the GraphQL allocations queries and mutations against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/allocations.test.ts
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

describe('Allocations API Integration', () => {
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

  describe('Query: allocations', () => {
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

  describe('Query: allocation', () => {
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

  describe('Mutation: createAllocation', () => {
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

  describe('Mutation: updateAllocation', () => {
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

  describe('Mutation: deleteAllocation', () => {
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

  describe('Mutation: moveFunds', () => {
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
      expect(result.data?.moveFunds.destAllocation.budgetId).toBe(
        destBudget.id,
      );
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
});
