/**
 * API Integration Tests for Budget Target History
 *
 * Tests that updating a budget's target amount creates history entries
 * and that the monthly overview uses historical targets for past months.
 *
 * Run with: just test-api-file tests/integration/api/budget-target-history.test.ts
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
  createTestAccount,
  createTestBudget,
  createTestBudgetTarget,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Budget target history', () => {
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

  test('should create target history entry when updating target amount with month', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      targetAmount: 500000,
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
          targetAmount: 8000,
          month: '2026-03',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.targetAmount).toBe(8000);
  });

  test('should not create target history entry when only name changes', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Old Name',
      targetAmount: 500000,
    });

    const result = await harness.executeQuery<{
      updateBudget: { id: number; name: string; targetAmount: number };
    }>(
      `
      mutation UpdateBudget($input: UpdateBudgetInput!) {
        updateBudget(input: $input) {
          id
          name
          targetAmount
        }
      }
    `,
      {
        input: {
          id: budget.id,
          month: '2026-03',
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudget.name).toBe('New Name');
    expect(result.data?.updateBudget.targetAmount).toBe(5000);
  });

  test('monthly overview should use historical target for past months', async () => {
    await createTestAccount(harness.getDb(), {
      name: 'Operational',
      role: 'operational',
      balance: 1000000,
    });

    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
      targetAmount: 500000,
    });

    await createTestBudgetTarget(harness.getDb(), {
      budgetId: budget.id,
      targetAmount: 300000,
      effectiveFrom: '2026-01',
    });

    await createTestBudgetTarget(harness.getDb(), {
      budgetId: budget.id,
      targetAmount: 500000,
      effectiveFrom: '2026-03',
    });

    const januaryResult = await harness.executeQuery<{
      monthlyOverview: {
        budgetSummaries: Array<{
          budgetId: number;
          targetAmount: number;
        }>;
      };
    }>(
      `
      query MonthlyOverview($month: String!) {
        monthlyOverview(month: $month) {
          budgetSummaries {
            budgetId
            targetAmount
          }
        }
      }
    `,
      { month: '2026-01' },
    );

    expect(januaryResult.errors).toBeUndefined();
    const januarySummary =
      januaryResult.data?.monthlyOverview.budgetSummaries.find(
        (summary) => summary.budgetId === budget.id,
      );
    expect(januarySummary?.targetAmount).toBe(3000);

    const februaryResult = await harness.executeQuery<{
      monthlyOverview: {
        budgetSummaries: Array<{
          budgetId: number;
          targetAmount: number;
        }>;
      };
    }>(
      `
      query MonthlyOverview($month: String!) {
        monthlyOverview(month: $month) {
          budgetSummaries {
            budgetId
            targetAmount
          }
        }
      }
    `,
      { month: '2026-02' },
    );

    expect(februaryResult.errors).toBeUndefined();
    const februarySummary =
      februaryResult.data?.monthlyOverview.budgetSummaries.find(
        (summary) => summary.budgetId === budget.id,
      );
    expect(februarySummary?.targetAmount).toBe(3000);

    const marchResult = await harness.executeQuery<{
      monthlyOverview: {
        budgetSummaries: Array<{
          budgetId: number;
          targetAmount: number;
        }>;
      };
    }>(
      `
      query MonthlyOverview($month: String!) {
        monthlyOverview(month: $month) {
          budgetSummaries {
            budgetId
            targetAmount
          }
        }
      }
    `,
      { month: '2026-03' },
    );

    expect(marchResult.errors).toBeUndefined();
    const marchSummary = marchResult.data?.monthlyOverview.budgetSummaries.find(
      (summary) => summary.budgetId === budget.id,
    );
    expect(marchSummary?.targetAmount).toBe(5000);
  });

  test('monthly overview should fall back to budget target when no history exists', async () => {
    await createTestAccount(harness.getDb(), {
      name: 'Operational',
      role: 'operational',
      balance: 1000000,
    });

    await createTestBudget(harness.getDb(), {
      name: 'No History Budget',
      targetAmount: 700000,
    });

    const result = await harness.executeQuery<{
      monthlyOverview: {
        budgetSummaries: Array<{
          name: string;
          targetAmount: number;
        }>;
      };
    }>(
      `
      query MonthlyOverview($month: String!) {
        monthlyOverview(month: $month) {
          budgetSummaries {
            name
            targetAmount
          }
        }
      }
    `,
      { month: '2026-02' },
    );

    expect(result.errors).toBeUndefined();
    const summary = result.data?.monthlyOverview.budgetSummaries.find(
      (summary) => summary.name === 'No History Budget',
    );
    expect(summary?.targetAmount).toBe(7000);
  });
});
