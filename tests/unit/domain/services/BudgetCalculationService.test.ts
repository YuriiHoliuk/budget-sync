import { describe, expect, test } from 'bun:test';
import {
  type AccountBalanceInput,
  type AllocationInput,
  BudgetCalculationService,
  type BudgetInput,
  type BudgetSummary,
  type MonthlyOverviewResult,
  type TransactionInput,
} from '@domain/services/BudgetCalculationService.ts';

function getSummary(
  result: MonthlyOverviewResult,
  index: number,
): BudgetSummary {
  const summary = result.budgetSummaries[index];
  if (!summary) {
    throw new Error(`No budget summary at index ${index}`);
  }
  return summary;
}

describe('BudgetCalculationService', () => {
  const service = new BudgetCalculationService();

  const MONTH = '2026-02';

  function makeDate(month: string, day = 15): Date {
    return new Date(`${month}-${String(day).padStart(2, '0')}T12:00:00Z`);
  }

  function makeAccounts(
    overrides: Partial<AccountBalanceInput>[] = [],
  ): AccountBalanceInput[] {
    return overrides.map((override) => ({
      balance: 0,
      role: 'operational' as const,
      ...override,
    }));
  }

  function makeBudget(overrides: Partial<BudgetInput> = {}): BudgetInput {
    return {
      budgetId: 1,
      name: 'Test Budget',
      targetAmount: 1000000,
      isArchived: false,
      cadenceUnit: null,
      cadenceCount: null,
      targetDate: null,
      cap: null,
      startDate: null,
      endDate: null,
      ...overrides,
    };
  }

  function makeAllocation(
    overrides: Partial<AllocationInput> = {},
  ): AllocationInput {
    return {
      budgetId: 1,
      amount: 500000,
      period: MONTH,
      ...overrides,
    };
  }

  function makeTransaction(
    overrides: Partial<TransactionInput> = {},
  ): TransactionInput {
    return {
      budgetId: 1,
      amount: 10000,
      type: 'debit',
      date: makeDate(MONTH),
      accountRole: 'operational',
      ...overrides,
    };
  }

  describe('readyToAssign (flow-based)', () => {
    test('should equal totalInflows minus all allocations ever', () => {
      // totalInflows = initialBalances + income
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational', initialBalance: 3000000 },
        { balance: 3000000, role: 'operational', initialBalance: 2000000 },
      ]);
      const allocations = [
        makeAllocation({ amount: 2000000, period: '2026-01' }),
        makeAllocation({ amount: 1500000, period: '2026-02' }),
      ];
      const transactions = [
        makeTransaction({
          amount: 1000000,
          type: 'credit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(
        MONTH,
        [],
        allocations,
        transactions,
        accounts,
      );

      // totalInflows = 3000000 + 2000000 (initial) + 1000000 (income) = 6000000
      // readyToAssign = 6000000 - 3500000 (allocations) = 2500000
      expect(result.readyToAssign).toBe(2500000);
    });

    test('should be negative when over-allocated', () => {
      const accounts = makeAccounts([
        { balance: 1000000, role: 'operational', initialBalance: 500000 },
      ]);
      const allocations = [makeAllocation({ amount: 2000000 })];

      const result = service.compute(MONTH, [], allocations, [], accounts);

      // totalInflows = 500000, allocations = 2000000
      expect(result.readyToAssign).toBe(-1500000);
    });

    test('should be zero when all inflows are assigned', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational', initialBalance: 3000000 },
      ]);
      const transactions = [
        makeTransaction({
          amount: 2000000,
          type: 'credit',
          accountRole: 'operational',
        }),
      ];
      const allocations = [makeAllocation({ amount: 5000000 })];

      const result = service.compute(
        MONTH,
        [],
        allocations,
        transactions,
        accounts,
      );

      // totalInflows = 3000000 + 2000000 = 5000000, allocations = 5000000
      expect(result.readyToAssign).toBe(0);
    });

    test('should exclude savings account initial balances from inflows', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational', initialBalance: 3000000 },
        { balance: 10000000, role: 'savings', initialBalance: 8000000 },
      ]);

      const result = service.compute(MONTH, [], [], [], accounts);

      // Only operational initial balance counts: 3000000
      expect(result.readyToAssign).toBe(3000000);
    });

    test('should not count transfer credits as income', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational', initialBalance: 5000000 },
      ]);
      const transactions = [
        makeTransaction({
          amount: 2000000,
          type: 'credit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 500000,
          type: 'credit',
          accountRole: 'operational',
          isTransfer: true,
        }),
      ];

      const result = service.compute(MONTH, [], [], transactions, accounts);

      // totalInflows = 5000000 (initial) + 2000000 (income, transfer excluded) = 7000000
      expect(result.readyToAssign).toBe(7000000);
    });

    test('should handle accounts without initial balance as zero', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational' }, // no initialBalance
      ]);
      const transactions = [
        makeTransaction({
          amount: 1000000,
          type: 'credit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(MONTH, [], [], transactions, accounts);

      // totalInflows = 0 (no initial) + 1000000 (income) = 1000000
      expect(result.readyToAssign).toBe(1000000);
    });
  });

  describe('capitalBalance', () => {
    test('should sum savings account balances', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'savings' },
        { balance: 3000000, role: 'savings' },
        { balance: 1000000, role: 'operational' },
      ]);

      const result = service.compute(MONTH, [], [], [], accounts);

      expect(result.capitalBalance).toBe(8000000);
    });

    test('should be zero with no savings accounts', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational' },
      ]);

      const result = service.compute(MONTH, [], [], [], accounts);

      expect(result.capitalBalance).toBe(0);
    });
  });

  describe('availableFunds', () => {
    test('should sum operational account balances', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational' },
        { balance: 3000000, role: 'operational' },
        { balance: 10000000, role: 'savings' },
      ]);

      const result = service.compute(MONTH, [], [], [], accounts);

      expect(result.availableFunds).toBe(8000000);
    });
  });

  describe('totalAllocated', () => {
    test('should sum allocations for the selected month only', () => {
      const allocations = [
        makeAllocation({ amount: 500000, period: '2026-01' }),
        makeAllocation({ amount: 300000, period: '2026-02' }),
        makeAllocation({ amount: 200000, period: '2026-02' }),
        makeAllocation({ amount: 100000, period: '2026-03' }),
      ];

      const result = service.compute(MONTH, [], allocations, [], []);

      expect(result.totalAllocated).toBe(500000);
    });

    test('should include negative allocations in the sum', () => {
      const allocations = [
        makeAllocation({ amount: 500000, period: MONTH }),
        makeAllocation({ amount: -200000, period: MONTH }),
      ];

      const result = service.compute(MONTH, [], allocations, [], []);

      expect(result.totalAllocated).toBe(300000);
    });
  });

  describe('totalSpent', () => {
    test('should sum debit transactions from operational accounts for the month', () => {
      const txns = [
        makeTransaction({
          amount: 10000,
          type: 'debit',
          date: makeDate(MONTH),
        }),
        makeTransaction({
          amount: 20000,
          type: 'debit',
          date: makeDate(MONTH),
        }),
        makeTransaction({
          amount: 5000,
          type: 'debit',
          date: makeDate('2026-01'),
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      expect(result.totalSpent).toBe(30000);
    });

    test('should not count credit transactions as spent', () => {
      const txns = [
        makeTransaction({ amount: 10000, type: 'debit' }),
        makeTransaction({ amount: 50000, type: 'credit' }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      expect(result.totalSpent).toBe(10000);
    });
  });

  describe('savingsRate', () => {
    test('should compute (income - expenses) / income', () => {
      const txns = [
        makeTransaction({
          amount: 100000,
          type: 'credit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 30000,
          type: 'debit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // (100000 - 30000) / 100000 = 0.7
      expect(result.savingsRate).toBeCloseTo(0.7);
    });

    test('should return 0 when there is no income', () => {
      const txns = [makeTransaction({ amount: 30000, type: 'debit' })];

      const result = service.compute(MONTH, [], [], txns, []);

      expect(result.savingsRate).toBe(0);
    });

    test('should only count income from operational accounts', () => {
      const txns = [
        makeTransaction({
          amount: 100000,
          type: 'credit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 500000,
          type: 'credit',
          accountRole: 'savings',
        }),
        makeTransaction({
          amount: 30000,
          type: 'debit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // income = 100000 (only operational), expenses = 30000
      expect(result.savingsRate).toBeCloseTo(0.7);
    });

    test('should exclude transfer credits from income', () => {
      const txns = [
        makeTransaction({
          amount: 100000,
          type: 'credit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 50000,
          type: 'credit',
          accountRole: 'operational',
          isTransfer: true,
        }),
        makeTransaction({
          amount: 30000,
          type: 'debit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // income = 100000 (transfer credit not counted), expenses = 30000
      expect(result.savingsRate).toBeCloseTo(0.7);
    });
  });

  describe('simple budget summaries', () => {
    test('should compute allocated, spent, available with accumulation', () => {
      const budget = makeBudget({ budgetId: 1 });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 300000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [makeTransaction({ budgetId: 1, amount: 200000 })];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      expect(summary.allocated).toBe(500000);
      expect(summary.spent).toBe(200000);
      // available = totalAllocated(800000) - totalSpent(200000) = 600000
      expect(summary.available).toBe(600000);
      // suggestedAllocation = max(0, targetAmount(1000000) - available(600000)) = 400000
      expect(summary.suggestedAllocation).toBe(400000);
    });

    test('should accumulate negative balance from previous months', () => {
      const budget = makeBudget({ budgetId: 1 });
      // Jan: allocated 100000, spent 150000
      // Feb: allocated 500000, spent 200000
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 100000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [
        makeTransaction({
          budgetId: 1,
          amount: 150000,
          date: makeDate('2026-01'),
        }),
        makeTransaction({
          budgetId: 1,
          amount: 200000,
          date: makeDate(MONTH),
        }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      // available = totalAllocated(600000) - totalSpent(350000) = 250000
      expect(summary.available).toBe(250000);
    });

    test('should accumulate across multiple months', () => {
      const budget = makeBudget({ budgetId: 1 });
      // Dec: allocated 100000, spent 200000
      // Jan: allocated 100000, spent 50000
      // Feb: allocated 500000
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 100000, period: '2025-12' }),
        makeAllocation({ budgetId: 1, amount: 100000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [
        makeTransaction({
          budgetId: 1,
          amount: 200000,
          date: makeDate('2025-12'),
        }),
        makeTransaction({
          budgetId: 1,
          amount: 50000,
          date: makeDate('2026-01'),
        }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      // available = totalAllocated(700000) - totalSpent(250000) = 450000
      expect(summary.available).toBe(450000);
    });
  });

  describe('accumulating budget summaries', () => {
    test('should accumulate all allocations and spending up to month', () => {
      const budget = makeBudget({ budgetId: 1 });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 500000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [
        makeTransaction({
          budgetId: 1,
          amount: 200000,
          date: makeDate('2026-01'),
        }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      // Total allocated: 1000000, Total spent: 200000
      expect(summary.available).toBe(800000);
      // allocated and spent are for current month only
      expect(summary.allocated).toBe(500000);
      expect(summary.spent).toBe(0);
      // suggestedAllocation = max(0, targetAmount(1000000) - available(800000)) = 200000
      expect(summary.suggestedAllocation).toBe(200000);
    });
  });

  describe('goal budget summaries (has targetDate)', () => {
    test('should accumulate like other budgets', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 5000000,
        targetDate: '2026-12-01',
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 1000000, period: '2025-12' }),
        makeAllocation({ budgetId: 1, amount: 1000000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 1000000, period: MONTH }),
      ];

      const result = service.compute(MONTH, [budget], allocations, [], []);

      const summary = getSummary(result, 0);
      expect(summary.available).toBe(3000000);
      expect(summary.allocated).toBe(1000000);
    });
  });

  describe('periodic budget summaries (has cadenceUnit + cadenceCount)', () => {
    test('should accumulate like other budgets', () => {
      const budget = makeBudget({
        budgetId: 1,
        cadenceUnit: 'month',
        cadenceCount: 1,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 200000, period: '2026-01' }),
        makeAllocation({ budgetId: 1, amount: 200000, period: MONTH }),
      ];
      const txns = [
        makeTransaction({
          budgetId: 1,
          amount: 100000,
          date: makeDate('2026-01'),
        }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      expect(summary.available).toBe(300000);
    });
  });

  describe('multiple budgets', () => {
    test('should compute summaries for all active budgets', () => {
      const budgets = [
        makeBudget({ budgetId: 1, name: 'Groceries' }),
        makeBudget({ budgetId: 2, name: 'Emergency Fund' }),
        makeBudget({ budgetId: 3, name: 'Archived', isArchived: true }),
      ];
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 300000, period: MONTH }),
        makeAllocation({ budgetId: 2, amount: 200000, period: MONTH }),
      ];
      const txns = [makeTransaction({ budgetId: 1, amount: 100000 })];

      const result = service.compute(MONTH, budgets, allocations, txns, []);

      expect(result.budgetSummaries).toHaveLength(2);
      expect(getSummary(result, 0).name).toBe('Groceries');
      expect(getSummary(result, 1).name).toBe('Emergency Fund');
    });

    test('should exclude archived budgets', () => {
      const budgets = [makeBudget({ budgetId: 1, isArchived: true })];

      const result = service.compute(MONTH, budgets, [], [], []);

      expect(result.budgetSummaries).toHaveLength(0);
    });
  });

  describe('suggestedAllocation', () => {
    test('should suggest targetAmount minus available for simple budgets', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 500000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 200000, period: MONTH }),
      ];
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      // available = 200000, target = 500000, suggestion = 300000
      expect(summary.suggestedAllocation).toBe(300000);
    });

    test('should suggest 0 when available meets or exceeds target', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 500000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 600000, period: MONTH }),
      ];
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(0);
    });

    test('should suggest 0 when targetAmount is 0', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 0,
      });
      const result = service.compute(MONTH, [budget], [], [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(0);
    });

    test('should divide remaining by months for goal budgets (has targetDate)', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 1200000,
        targetDate: '2026-06-15',
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 200000, period: '2026-01' }),
      ];
      // Month is 2026-02, target is 2026-06 = 4 months remaining
      // remaining = 1200000 - 200000 = 1000000
      // suggestion = ceil(1000000 / 4) = 250000
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(250000);
    });

    test('should suggest full remaining for goal without target date', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 1000000,
        targetDate: null,
      });
      const result = service.compute(MONTH, [budget], [], [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(1000000);
    });

    test('should compute monthly amount for year cadence periodic budget', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 1200000,
        cadenceUnit: 'year',
        cadenceCount: 1,
      });
      // monthly = ceil(1200000 / 12) = 100000
      // available = 0, no cap, suggestion = max(0, 100000 - 0) = 100000
      const result = service.compute(MONTH, [budget], [], [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(100000);
    });

    test('should respect cap for periodic budget', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 100000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        cap: 250000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 50000, period: '2026-01' }),
      ];
      // available = 50000, cap = 250000, monthly = 100000
      // periodic suggestion = max(0, 100000 - 50000) = 50000
      // cap post-processing = min(50000, max(0, 250000 - 50000)) = 50000
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(50000);
    });

    test('should limit suggestion by cap when near cap limit', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 100000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        cap: 120000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 90000, period: '2026-01' }),
      ];
      // available = 90000, cap = 120000, monthly = 100000
      // periodic suggestion = max(0, 100000 - 90000) = 10000
      // cap post-processing = min(10000, max(0, 120000 - 90000)) = min(10000, 30000) = 10000
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(10000);
    });

    test('should suggest 0 when available reaches cap', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 100000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        cap: 200000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 200000, period: '2026-01' }),
      ];
      // available = 200000, cap = 200000
      // suggestion = min(100000, max(0, 200000 - 200000)) = min(100000, 0) = 0
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(0);
    });

    test('should compute multi-month cadence monthly amount', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 600000,
        cadenceUnit: 'month',
        cadenceCount: 6,
      });
      // monthly = ceil(600000 / 6) = 100000
      const result = service.compute(MONTH, [budget], [], [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(100000);
    });

    test('should suggest targetAmount minus available for accumulating budgets', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 500000,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 200000, period: '2026-01' }),
      ];
      const result = service.compute(MONTH, [budget], allocations, [], []);
      const summary = getSummary(result, 0);
      expect(summary.suggestedAllocation).toBe(300000);
    });
  });

  describe('budget visibility filtering', () => {
    test('budget before start date: excluded', () => {
      const budget = makeBudget({
        budgetId: 1,
        startDate: '2026-03-01',
      });

      const result = service.compute(MONTH, [budget], [], [], []);

      expect(result.budgetSummaries.length).toBe(0);
    });

    test('budget past end date with zero balance: excluded', () => {
      const budget = makeBudget({
        budgetId: 1,
        endDate: '2026-01-31',
      });

      const result = service.compute(MONTH, [budget], [], [], []);

      expect(result.budgetSummaries.length).toBe(0);
    });

    test('budget past end date with positive available: included, isExpired: true, suggestedAllocation: 0', () => {
      const budget = makeBudget({
        budgetId: 1,
        endDate: '2026-01-31',
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 500000, period: '2026-01' }),
      ];

      const result = service.compute(MONTH, [budget], allocations, [], []);

      expect(result.budgetSummaries.length).toBe(1);
      const summary = getSummary(result, 0);
      expect(summary.isExpired).toBe(true);
      expect(summary.suggestedAllocation).toBe(0);
      expect(summary.available).toBe(500000);
    });

    test('budget active in viewed month: included, isExpired: false', () => {
      const budget = makeBudget({
        budgetId: 1,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 300000, period: MONTH }),
      ];

      const result = service.compute(MONTH, [budget], allocations, [], []);

      expect(result.budgetSummaries.length).toBe(1);
      const summary = getSummary(result, 0);
      expect(summary.isExpired).toBe(false);
    });

    test('budget with no dates (recurring): always included', () => {
      const budget = makeBudget({
        budgetId: 1,
        startDate: null,
        endDate: null,
      });

      const result = service.compute(MONTH, [budget], [], [], []);

      expect(result.budgetSummaries.length).toBe(1);
      const summary = getSummary(result, 0);
      expect(summary.isExpired).toBe(false);
    });

    test('budget with targetDate past (no endDate): excluded if zero balance', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 1000000,
        targetDate: '2026-01-15',
        endDate: null,
      });

      const result = service.compute(MONTH, [budget], [], [], []);

      expect(result.budgetSummaries.length).toBe(0);
    });

    test('budget with targetDate past and funds: included as expired', () => {
      const budget = makeBudget({
        budgetId: 1,
        targetAmount: 1000000,
        targetDate: '2026-01-15',
        endDate: null,
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 800000, period: '2026-01' }),
      ];

      const result = service.compute(MONTH, [budget], allocations, [], []);

      expect(result.budgetSummaries.length).toBe(1);
      const summary = getSummary(result, 0);
      expect(summary.isExpired).toBe(true);
      expect(summary.suggestedAllocation).toBe(0);
      expect(summary.available).toBe(800000);
    });

    test('month-granularity: endDate 2026-01-15 still shows in 2026-01', () => {
      const budget = makeBudget({
        budgetId: 1,
        endDate: '2026-01-15',
      });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 300000, period: '2026-01' }),
      ];

      // Viewing 2026-01, endMonth is also 2026-01, so budget is still active
      const result = service.compute('2026-01', [budget], allocations, [], []);

      expect(result.budgetSummaries.length).toBe(1);
      const summary = getSummary(result, 0);
      expect(summary.isExpired).toBe(false);
    });
  });

  describe('transfer and savings filtering', () => {
    test('should not count savings debits in totalSpent', () => {
      const txns = [
        makeTransaction({
          amount: 10000,
          type: 'debit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 50000,
          type: 'debit',
          accountRole: 'savings',
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // Only operational debits count: 10000
      expect(result.totalSpent).toBe(10000);
    });

    test('should not count transfer debits in totalSpent', () => {
      const txns = [
        makeTransaction({
          amount: 10000,
          type: 'debit',
          accountRole: 'operational',
        }),
        makeTransaction({
          amount: 90000,
          type: 'debit',
          accountRole: 'operational',
          isTransfer: true,
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // Transfer debits excluded: only 10000
      expect(result.totalSpent).toBe(10000);
    });

    test('should not count transfer debits in per-budget spent', () => {
      const budget = makeBudget({ budgetId: 1 });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [
        makeTransaction({ budgetId: 1, amount: 100000 }),
        makeTransaction({ budgetId: 1, amount: 50000, isTransfer: true }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      // Transfer debit excluded from budget spent
      expect(summary.spent).toBe(100000);
      // available = 500000 - 100000 = 400000
      expect(summary.available).toBe(400000);
    });
  });

  describe('edge cases', () => {
    test('should handle empty data', () => {
      const result = service.compute(MONTH, [], [], [], []);

      expect(result.month).toBe(MONTH);
      expect(result.readyToAssign).toBe(0);
      expect(result.totalAllocated).toBe(0);
      expect(result.totalSpent).toBe(0);
      expect(result.capitalBalance).toBe(0);
      expect(result.availableFunds).toBe(0);
      expect(result.savingsRate).toBe(0);
      expect(result.budgetSummaries).toHaveLength(0);
    });

    test('should handle transactions without budget assignment', () => {
      const budget = makeBudget({ budgetId: 1 });
      const allocations = [makeAllocation({ budgetId: 1, amount: 500000 })];
      const txns = [
        makeTransaction({ budgetId: null, amount: 50000 }),
        makeTransaction({ budgetId: 1, amount: 100000 }),
      ];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      // Unbudgeted transaction still counts in totalSpent
      expect(result.totalSpent).toBe(150000);
      // But not in budget summary
      const summary = getSummary(result, 0);
      expect(summary.spent).toBe(100000);
      expect(summary.available).toBe(400000);
    });

    test('should handle future allocations not affecting current month totals', () => {
      const accounts = makeAccounts([
        { balance: 1000000, role: 'operational', initialBalance: 1000000 },
      ]);
      const allocations = [
        makeAllocation({ amount: 500000, period: MONTH }),
        makeAllocation({ amount: 300000, period: '2026-03' }),
      ];

      const result = service.compute(MONTH, [], allocations, [], accounts);

      expect(result.totalAllocated).toBe(500000);
      // readyToAssign uses all allocations ever
      // readyToAssign = 1000000 (initial) - 800000 (all allocations) = 200000
      expect(result.readyToAssign).toBe(200000);
    });
  });
});
