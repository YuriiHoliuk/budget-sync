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
import { budgetTargets } from '@modules/database/schema/index.ts';
import { eq } from 'drizzle-orm';
import { clearAllTestData, createTestBudget } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

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
          month: getCurrentMonth(),
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.name).toBe('New Name');
  });

  test('should update budget target amount and create history entry', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      targetAmount: 500000, // 5000 UAH in minor units
    });

    const month = getCurrentMonth();

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
          month,
          targetAmount: 8000, // major units
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.targetAmount).toBe(8000);

    // Verify a history entry was created
    const targets = await harness
      .getDb()
      .select()
      .from(budgetTargets)
      .where(eq(budgetTargets.budgetId, budget.id));

    expect(targets.length).toBe(1);
    const target = targets[0];
    expect(target?.targetAmount).toBe(800000); // In minor units
    expect(target?.effectiveFrom).toBe(month);
  });

  test('should not create history entry when target amount unchanged', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      targetAmount: 500000, // 5000 UAH
    });

    // Update only name, not target amount
    await harness.executeQuery(
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
          month: getCurrentMonth(),
          name: 'Renamed Budget',
        },
      },
    );

    // Verify no history entry was created
    const targets = await harness
      .getDb()
      .select()
      .from(budgetTargets)
      .where(eq(budgetTargets.budgetId, budget.id));

    expect(targets.length).toBe(0);
  });

  test('should update cap', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
      targetAmount: 100000,
    });

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        cap: number | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          cap
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month: getCurrentMonth(),
          cap: 20000,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.cap).toBe(20000);
  });

  test('should clear cap when set to null', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget with cap',
      targetAmount: 100000,
      cap: 500000, // 5000 in minor units
    });

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        cap: number | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          cap
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month: getCurrentMonth(),
          cap: null,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.cap).toBeNull();
  });

  test('should update endDate to valid future date', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
      targetAmount: 100000,
    });

    const month = getCurrentMonth();
    // End date is first day of current month - should be valid
    const endDate = `${month}-15`;

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        endDate: string | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          endDate
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month,
          endDate,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.endDate).toBe(endDate);
  });

  test('should clear endDate when set to null', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
      targetAmount: 100000,
      endDate: '2026-12-31',
    });

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        endDate: string | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          endDate
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month: getCurrentMonth(),
          endDate: null,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.endDate).toBeNull();
  });

  test('should reject endDate set to past month', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
      targetAmount: 100000,
    });

    const month = getCurrentMonth();
    // Calculate a date in the previous month
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const pastEndDate = previousMonth.toISOString().split('T')[0];

    const result = await harness.executeQuery<{
      updateBudget: {
        id: number;
        endDate: string | null;
      };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          endDate
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month,
          endDate: pastEndDate,
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('End date');
  });

  test('should require month field', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget',
    });

    const result = await harness.executeQuery(
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
          // month intentionally omitted
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('month');
  });

  test('should return error for non-existent budget', async () => {
    const result = await harness.executeQuery(
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
          id: 99999,
          month: getCurrentMonth(),
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });

  test('should return error for duplicate name', async () => {
    await createTestBudget(harness.getDb(), {
      name: 'Existing Budget',
    });

    const budgetToUpdate = await createTestBudget(harness.getDb(), {
      name: 'Another Budget',
    });

    const result = await harness.executeQuery(
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
          id: budgetToUpdate.id,
          month: getCurrentMonth(),
          name: 'Existing Budget', // Try to rename to existing name
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('already exists');
  });
});
