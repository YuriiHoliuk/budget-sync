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
      type: 'spending',
      targetAmount: 1000000,
      isArchived: false,
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
      // totalInflows = initialBalances + income - excluded
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

    test('should subtract excluded transactions from inflows', () => {
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
          excludeFromCalculations: true,
        }),
      ];

      const result = service.compute(MONTH, [], [], transactions, accounts);

      // totalInflows = 5000000 (initial) + 2000000 (income) - 500000 (excluded) = 6500000
      expect(result.readyToAssign).toBe(6500000);
    });

    test('should not count excluded credits as income', () => {
      const accounts = makeAccounts([
        { balance: 5000000, role: 'operational', initialBalance: 5000000 },
      ]);
      const transactions = [
        makeTransaction({
          amount: 2000000,
          type: 'credit',
          accountRole: 'operational',
          excludeFromCalculations: true,
        }),
      ];

      const result = service.compute(MONTH, [], [], transactions, accounts);

      // totalInflows = 5000000 (initial) + 0 (excluded credit not counted) - 2000000 (excluded) = 3000000
      expect(result.readyToAssign).toBe(3000000);
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

    test('should exclude transactions marked excludeFromCalculations from income', () => {
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
          excludeFromCalculations: true,
        }),
        makeTransaction({
          amount: 30000,
          type: 'debit',
          accountRole: 'operational',
        }),
      ];

      const result = service.compute(MONTH, [], [], txns, []);

      // income = 100000 (excluded credit not counted), expenses = 30000
      expect(result.savingsRate).toBeCloseTo(0.7);
    });
  });

  describe('spending budget summaries', () => {
    test('should compute allocated, spent, available for current month', () => {
      const budget = makeBudget({ budgetId: 1, type: 'spending' });
      const allocations = [
        makeAllocation({ budgetId: 1, amount: 500000, period: MONTH }),
      ];
      const txns = [makeTransaction({ budgetId: 1, amount: 200000 })];

      const result = service.compute(MONTH, [budget], allocations, txns, []);

      const summary = getSummary(result, 0);
      expect(summary.allocated).toBe(500000);
      expect(summary.spent).toBe(200000);
      expect(summary.available).toBe(300000);
      expect(summary.carryover).toBe(0);
    });

    test('should carry forward negative balance from previous month', () => {
      const budget = makeBudget({ budgetId: 1, type: 'spending' });
      // Jan: allocated 100000, spent 150000 → balance -50000 → carryover -50000
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
      expect(summary.carryover).toBe(-50000);
      // available = 500000 - 200000 + (-50000) = 250000
      expect(summary.available).toBe(250000);
    });

    test('should NOT carry forward positive balance from previous month', () => {
      const budget = makeBudget({ budgetId: 1, type: 'spending' });
      // Jan: allocated 500000, spent 200000 → balance +300000 → carryover 0
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
      expect(summary.carryover).toBe(0);
      expect(summary.available).toBe(500000);
    });

    test('should chain carryover across multiple months', () => {
      const budget = makeBudget({ budgetId: 1, type: 'spending' });
      // Dec: allocated 100000, spent 200000 → balance -100000
      // Jan: allocated 100000, spent 50000 → balance with carry = 100000-50000+(-100000) = -50000
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
      expect(summary.carryover).toBe(-50000);
      expect(summary.available).toBe(450000);
    });
  });

  describe('savings budget summaries', () => {
    test('should accumulate all allocations and spending up to month', () => {
      const budget = makeBudget({ budgetId: 1, type: 'savings' });
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
      expect(summary.carryover).toBe(0);
    });
  });

  describe('goal budget summaries', () => {
    test('should accumulate like savings', () => {
      const budget = makeBudget({
        budgetId: 1,
        type: 'goal',
        targetAmount: 5000000,
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

  describe('periodic budget summaries', () => {
    test('should accumulate like savings', () => {
      const budget = makeBudget({ budgetId: 1, type: 'periodic' });
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
        makeBudget({ budgetId: 1, name: 'Groceries', type: 'spending' }),
        makeBudget({ budgetId: 2, name: 'Emergency Fund', type: 'savings' }),
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
      const budget = makeBudget({ budgetId: 1, type: 'spending' });
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
