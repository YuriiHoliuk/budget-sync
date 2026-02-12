/**
 * API Integration Tests for Reorder Budget Mutation
 *
 * Tests the GraphQL reorderBudget mutation against real database.
 * Uses fractional indexing for budget ordering.
 *
 * Run with: just test-api-file tests/integration/api/reorder-budget.test.ts
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

const REORDER_MUTATION = `
  mutation ReorderBudget($input: ReorderBudgetInput!) {
    reorderBudget(input: $input) {
      id
      name
      sortOrder
    }
  }
`;

const GET_BUDGETS_QUERY = `
  query GetBudgets {
    budgets {
      id
      name
      sortOrder
    }
  }
`;

interface BudgetResult {
  id: number;
  name: string;
  sortOrder: string | null;
}

describe('Mutation: reorderBudget', () => {
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

  test('should move budget to beginning (afterBudgetId=null)', async () => {
    const db = harness.getDb();

    // Create 3 budgets in order: A, B, C
    const budgetA = await createTestBudget(db, {
      name: 'Budget A',
      sortOrder: 'a0',
    });
    await createTestBudget(db, { name: 'Budget B', sortOrder: 'a1' });
    const budgetC = await createTestBudget(db, {
      name: 'Budget C',
      sortOrder: 'a2',
    });

    // Move C to beginning (before A)
    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budgetC.id,
        afterBudgetId: null,
        beforeBudgetId: budgetA.id,
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reorderBudget.id).toBe(budgetC.id);

    // Verify new order: C, A, B
    const budgetsResult = await harness.executeQuery<{
      budgets: BudgetResult[];
    }>(GET_BUDGETS_QUERY);

    const budgets = budgetsResult.data?.budgets ?? [];
    const names = budgets.map((b) => b.name);
    expect(names).toEqual(['Budget C', 'Budget A', 'Budget B']);
  });

  test('should move budget to end (beforeBudgetId=null)', async () => {
    const db = harness.getDb();

    // Create 3 budgets in order: A, B, C
    const budgetA = await createTestBudget(db, {
      name: 'Budget A',
      sortOrder: 'a0',
    });
    await createTestBudget(db, { name: 'Budget B', sortOrder: 'a1' });
    const budgetC = await createTestBudget(db, {
      name: 'Budget C',
      sortOrder: 'a2',
    });

    // Move A to end (after C)
    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budgetA.id,
        afterBudgetId: budgetC.id,
        beforeBudgetId: null,
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reorderBudget.id).toBe(budgetA.id);

    // Verify new order: B, C, A
    const budgetsResult = await harness.executeQuery<{
      budgets: BudgetResult[];
    }>(GET_BUDGETS_QUERY);

    const budgets = budgetsResult.data?.budgets ?? [];
    const names = budgets.map((b) => b.name);
    expect(names).toEqual(['Budget B', 'Budget C', 'Budget A']);
  });

  test('should move budget to middle (between two budgets)', async () => {
    const db = harness.getDb();

    // Create 3 budgets in order: A, B, C
    const budgetA = await createTestBudget(db, {
      name: 'Budget A',
      sortOrder: 'a0',
    });
    const budgetB = await createTestBudget(db, {
      name: 'Budget B',
      sortOrder: 'a1',
    });
    const budgetC = await createTestBudget(db, {
      name: 'Budget C',
      sortOrder: 'a2',
    });

    // Move A to between B and C
    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budgetA.id,
        afterBudgetId: budgetB.id,
        beforeBudgetId: budgetC.id,
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reorderBudget.id).toBe(budgetA.id);

    // Verify new order: B, A, C
    const budgetsResult = await harness.executeQuery<{
      budgets: BudgetResult[];
    }>(GET_BUDGETS_QUERY);

    const budgets = budgetsResult.data?.budgets ?? [];
    const names = budgets.map((b) => b.name);
    expect(names).toEqual(['Budget B', 'Budget A', 'Budget C']);
  });

  test('should return error for non-existent budget', async () => {
    const db = harness.getDb();

    await createTestBudget(db, { name: 'Budget A', sortOrder: 'a0' });

    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: 99999,
        afterBudgetId: null,
        beforeBudgetId: null,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });

  test('should return error for non-existent afterBudgetId', async () => {
    const db = harness.getDb();

    const budgetA = await createTestBudget(db, {
      name: 'Budget A',
      sortOrder: 'a0',
    });

    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budgetA.id,
        afterBudgetId: 99999,
        beforeBudgetId: null,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });

  test('should return error for non-existent beforeBudgetId', async () => {
    const db = harness.getDb();

    const budgetA = await createTestBudget(db, {
      name: 'Budget A',
      sortOrder: 'a0',
    });

    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budgetA.id,
        afterBudgetId: null,
        beforeBudgetId: 99999,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });

  test('should preserve sortOrder when both bounds are null', async () => {
    const db = harness.getDb();

    // Create single budget
    const budget = await createTestBudget(db, {
      name: 'Single Budget',
      sortOrder: 'a0',
    });

    // Reorder with no bounds (should work - generates new key between null, null)
    const result = await harness.executeQuery<{
      reorderBudget: BudgetResult;
    }>(REORDER_MUTATION, {
      input: {
        budgetId: budget.id,
        afterBudgetId: null,
        beforeBudgetId: null,
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reorderBudget.id).toBe(budget.id);
    expect(result.data?.reorderBudget.sortOrder).toBeTruthy();
  });
});
