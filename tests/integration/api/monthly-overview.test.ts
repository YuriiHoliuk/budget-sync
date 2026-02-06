/**
 * API Integration Tests for Monthly Overview
 *
 * Tests the GraphQL monthlyOverview query against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/monthly-overview.test.ts
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
  createTestAllocation,
  createTestBudget,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const TEST_MONTH = '2026-02';

describe('Monthly Overview API Integration', () => {
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

  describe('Query: monthlyOverview', () => {
    test('should return empty overview when no data exists', async () => {
      const result = await harness.executeQuery<{
        monthlyOverview: {
          month: string;
          readyToAssign: number;
          totalAllocated: number;
          totalSpent: number;
          capitalBalance: number;
          availableFunds: number;
          savingsRate: number;
          budgetSummaries: unknown[];
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            month
            readyToAssign
            totalAllocated
            totalSpent
            capitalBalance
            availableFunds
            savingsRate
            budgetSummaries {
              budgetId
            }
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.month).toBe(TEST_MONTH);
      expect(result.data?.monthlyOverview.readyToAssign).toBe(0);
      expect(result.data?.monthlyOverview.totalAllocated).toBe(0);
      expect(result.data?.monthlyOverview.totalSpent).toBe(0);
      expect(result.data?.monthlyOverview.capitalBalance).toBe(0);
      expect(result.data?.monthlyOverview.availableFunds).toBe(0);
      expect(result.data?.monthlyOverview.budgetSummaries).toEqual([]);
    });

    test('should compute availableFunds from operational accounts', async () => {
      // Create operational account with balance
      await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
        balance: 5000000, // 50,000 UAH
      });

      await createTestAccount(harness.getDb(), {
        name: 'Secondary Account',
        role: 'operational',
        balance: 1500000, // 15,000 UAH
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          availableFunds: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            availableFunds
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.availableFunds).toBe(65000); // 50000 + 15000
    });

    test('should compute capitalBalance from savings accounts', async () => {
      // Operational account should not count
      await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
        balance: 5000000,
      });

      // Savings accounts should count
      await createTestAccount(harness.getDb(), {
        name: 'Emergency Fund',
        role: 'savings',
        balance: 10000000, // 100,000 UAH
      });

      await createTestAccount(harness.getDb(), {
        name: 'Investment Account',
        role: 'savings',
        balance: 25000000, // 250,000 UAH
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          capitalBalance: number;
          availableFunds: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            capitalBalance
            availableFunds
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.capitalBalance).toBe(350000); // 100000 + 250000
      expect(result.data?.monthlyOverview.availableFunds).toBe(50000); // only operational
    });

    test('should compute totalAllocated from allocations', async () => {
      const budget1 = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
      });
      const budget2 = await createTestBudget(harness.getDb(), {
        name: 'Transport',
      });

      await createTestAllocation(harness.getDb(), {
        budgetId: budget1.id,
        amount: 500000, // 5000 UAH
        period: TEST_MONTH,
      });
      await createTestAllocation(harness.getDb(), {
        budgetId: budget2.id,
        amount: 200000, // 2000 UAH
        period: TEST_MONTH,
      });

      // Allocation in different month should not count
      await createTestAllocation(harness.getDb(), {
        budgetId: budget1.id,
        amount: 1000000,
        period: '2026-01',
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          totalAllocated: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            totalAllocated
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.totalAllocated).toBe(7000); // 5000 + 2000
    });

    test('should compute totalSpent from expense transactions in month', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      // Expenses - should count
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -35000, // -350 UAH
        type: 'debit',
        date: new Date('2026-02-05'),
      });
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -28000, // -280 UAH
        type: 'debit',
        date: new Date('2026-02-10'),
      });

      // Income - should not count as spent
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: 7500000, // +75000 UAH income
        type: 'credit',
        date: new Date('2026-02-01'),
      });

      // Transaction from different month - should not count
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -50000,
        type: 'debit',
        date: new Date('2026-01-20'),
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          totalSpent: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            totalSpent
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.totalSpent).toBe(630); // 350 + 280 (absolute values)
    });

    test('should compute readyToAssign as availableFunds minus totalAllocated', async () => {
      // Set up operational account with balance
      await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
        balance: 5000000, // 50,000 UAH
      });

      // Set up allocations
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
      });
      await createTestAllocation(harness.getDb(), {
        budgetId: budget.id,
        amount: 3000000, // 30,000 UAH
        period: TEST_MONTH,
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          readyToAssign: number;
          availableFunds: number;
          totalAllocated: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            readyToAssign
            availableFunds
            totalAllocated
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.availableFunds).toBe(50000);
      expect(result.data?.monthlyOverview.totalAllocated).toBe(30000);
      expect(result.data?.monthlyOverview.readyToAssign).toBe(20000); // 50000 - 30000
    });

    test('should compute negative readyToAssign when overspent', async () => {
      // Set up operational account with small balance
      await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
        balance: 1000000, // 10,000 UAH
      });

      // Over-allocate
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
      });
      await createTestAllocation(harness.getDb(), {
        budgetId: budget.id,
        amount: 2000000, // 20,000 UAH
        period: TEST_MONTH,
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          readyToAssign: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            readyToAssign
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.readyToAssign).toBe(-10000); // 10000 - 20000
    });

    test('should return budget summaries with computed values', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      const groceriesBudget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
        type: 'spending',
        targetAmount: 800000, // 8000 UAH target
      });

      // Allocate for this month
      await createTestAllocation(harness.getDb(), {
        budgetId: groceriesBudget.id,
        amount: 600000, // 6000 UAH
        period: TEST_MONTH,
      });

      // Spend against this budget
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -25000, // -250 UAH
        type: 'debit',
        budgetId: groceriesBudget.id,
        date: new Date('2026-02-05'),
      });
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -15000, // -150 UAH
        type: 'debit',
        budgetId: groceriesBudget.id,
        date: new Date('2026-02-10'),
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          budgetSummaries: Array<{
            budgetId: number;
            name: string;
            type: string;
            targetAmount: number;
            allocated: number;
            spent: number;
            available: number;
          }>;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            budgetSummaries {
              budgetId
              name
              type
              targetAmount
              allocated
              spent
              available
            }
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.budgetSummaries).toHaveLength(1);

      const summary = result.data?.monthlyOverview.budgetSummaries[0];
      expect(summary?.budgetId).toBe(groceriesBudget.id);
      expect(summary?.name).toBe('Groceries');
      expect(summary?.type).toBe('SPENDING');
      expect(summary?.targetAmount).toBe(8000); // target amount
      expect(summary?.allocated).toBe(6000); // allocated this month
      expect(summary?.spent).toBe(400); // 250 + 150
      expect(summary?.available).toBe(5600); // 6000 - 400
    });

    test('should compute savingsRate correctly', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      // Income transaction
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: 10000000, // +100,000 UAH income
        type: 'credit',
        date: new Date('2026-02-01'),
      });

      // Expense transactions
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -3000000, // -30,000 UAH
        type: 'debit',
        date: new Date('2026-02-15'),
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          savingsRate: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            savingsRate
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      // savingsRate = (income - expenses) / income = (100000 - 30000) / 100000 = 0.7
      expect(result.data?.monthlyOverview.savingsRate).toBeCloseTo(0.7, 2);
    });

    test('should handle zero income gracefully for savings rate', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      // Only expense, no income
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -3000000,
        type: 'debit',
        date: new Date('2026-02-15'),
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          savingsRate: number;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            savingsRate
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      // When income is 0, savingsRate should be 0 (not NaN or Infinity)
      expect(result.data?.monthlyOverview.savingsRate).toBe(0);
    });

    test('should compute negative carryover (overspending) from previous months', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      const groceriesBudget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
        type: 'spending',
      });

      // Previous month allocation
      await createTestAllocation(harness.getDb(), {
        budgetId: groceriesBudget.id,
        amount: 300000, // 3000 UAH
        period: '2026-01',
      });

      // Previous month overspending (more than allocated)
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -500000, // -5000 UAH (overspent by 2000)
        type: 'debit',
        budgetId: groceriesBudget.id,
        date: new Date('2026-01-15'),
      });

      // Current month allocation
      await createTestAllocation(harness.getDb(), {
        budgetId: groceriesBudget.id,
        amount: 500000, // 5000 UAH
        period: TEST_MONTH,
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          budgetSummaries: Array<{
            budgetId: number;
            name: string;
            allocated: number;
            carryover: number;
            available: number;
          }>;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            budgetSummaries {
              budgetId
              name
              allocated
              carryover
              available
            }
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();

      const summary = result.data?.monthlyOverview.budgetSummaries[0];
      expect(summary?.allocated).toBe(5000); // this month
      // carryover = 3000 - 5000 = -2000 (only negative carries forward for spending)
      expect(summary?.carryover).toBe(-2000);
      // available = allocated + carryover - spent = 5000 + (-2000) - 0 = 3000
      expect(summary?.available).toBe(3000);
    });

    test('should NOT carry forward positive balance for spending budgets', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        role: 'operational',
      });

      const groceriesBudget = await createTestBudget(harness.getDb(), {
        name: 'Groceries',
        type: 'spending',
      });

      // Previous month allocation
      await createTestAllocation(harness.getDb(), {
        budgetId: groceriesBudget.id,
        amount: 500000, // 5000 UAH
        period: '2026-01',
      });

      // Previous month underspending (positive balance remains)
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -200000, // -2000 UAH (3000 left over)
        type: 'debit',
        budgetId: groceriesBudget.id,
        date: new Date('2026-01-15'),
      });

      // Current month allocation
      await createTestAllocation(harness.getDb(), {
        budgetId: groceriesBudget.id,
        amount: 500000, // 5000 UAH
        period: TEST_MONTH,
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          budgetSummaries: Array<{
            budgetId: number;
            carryover: number;
            available: number;
          }>;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            budgetSummaries {
              budgetId
              carryover
              available
            }
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();

      const summary = result.data?.monthlyOverview.budgetSummaries[0];
      // Positive leftover does NOT carry forward for spending budgets
      expect(summary?.carryover).toBe(0);
      // available = allocated + carryover - spent = 5000 + 0 - 0 = 5000
      expect(summary?.available).toBe(5000);
    });

    test('should only include active budgets in summaries', async () => {
      await createTestBudget(harness.getDb(), {
        name: 'Active Budget',
        isArchived: false,
      });
      await createTestBudget(harness.getDb(), {
        name: 'Archived Budget',
        isArchived: true,
      });

      const result = await harness.executeQuery<{
        monthlyOverview: {
          budgetSummaries: Array<{
            name: string;
          }>;
        };
      }>(
        `
        query GetMonthlyOverview($month: String!) {
          monthlyOverview(month: $month) {
            budgetSummaries {
              name
            }
          }
        }
      `,
        { month: TEST_MONTH },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.monthlyOverview.budgetSummaries).toHaveLength(1);
      expect(result.data?.monthlyOverview.budgetSummaries[0]?.name).toBe(
        'Active Budget',
      );
    });
  });
});
