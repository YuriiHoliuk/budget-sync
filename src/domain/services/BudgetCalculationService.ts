import type { BudgetType, TargetCadence } from '@domain/entities/Budget.ts';

/**
 * Input data for a single budget in monthly overview computation.
 * All monetary values are in minor units (kopecks).
 */
export interface BudgetInput {
  budgetId: number;
  name: string;
  type: BudgetType;
  targetAmount: number;
  isArchived: boolean;
  targetCadence: TargetCadence | null;
  targetCadenceMonths: number | null;
  targetDate: string | null;
  cap: number | null;
}

/**
 * A single allocation record for computation.
 * Amount is in minor units and can be negative.
 */
export interface AllocationInput {
  budgetId: number;
  amount: number;
  period: string; // YYYY-MM
}

/**
 * A single transaction record for computation.
 * Amount is in minor units (always positive — use type to determine direction).
 */
export interface TransactionInput {
  budgetId: number | null;
  amount: number; // absolute value in minor units
  type: 'credit' | 'debit';
  date: Date;
  accountRole: 'operational' | 'savings';
  excludeFromCalculations?: boolean;
}

/**
 * Account balance data for computation.
 */
export interface AccountBalanceInput {
  balance: number; // minor units
  role: 'operational' | 'savings';
  initialBalance?: number; // minor units, undefined if not set
}

/**
 * Computed summary for a single budget in a given month.
 */
export interface BudgetSummary {
  budgetId: number;
  name: string;
  type: BudgetType;
  targetAmount: number;
  allocated: number;
  spent: number;
  available: number;
  suggestedAllocation: number;
}

/**
 * Full monthly overview result.
 */
export interface MonthlyOverviewResult {
  month: string;
  readyToAssign: number;
  totalAllocated: number;
  totalSpent: number;
  capitalBalance: number;
  availableFunds: number;
  savingsRate: number;
  budgetSummaries: BudgetSummary[];
}

/**
 * Pure computation service for budget calculations.
 *
 * All balances, totals, and availability are computed dynamically
 * from allocations and transactions. There are no stored snapshots.
 *
 * All budget types use the accumulating formula:
 * available = SUM(allocated up to month) - SUM(spent up to month)
 */
export class BudgetCalculationService {
  /**
   * Computes the full monthly overview for a given month.
   */
  compute(
    month: string,
    budgets: BudgetInput[],
    allocations: AllocationInput[],
    transactions: TransactionInput[],
    accountBalances: AccountBalanceInput[],
  ): MonthlyOverviewResult {
    const capitalBalance = this.computeCapitalBalance(accountBalances);
    const availableFunds = this.computeAvailableFunds(accountBalances);
    const totalAllocatedEver = this.computeTotalAllocations(allocations);
    const totalInflows = this.computeTotalInflows(
      accountBalances,
      transactions,
    );
    const readyToAssign = totalInflows - totalAllocatedEver;
    const totalAllocatedThisMonth = this.computeAllocationsForMonth(
      allocations,
      month,
    );
    const totalSpent = this.computeTotalSpentForMonth(transactions, month);
    const income = this.computeIncomeForMonth(transactions, month);
    const savingsRate = income > 0 ? (income - totalSpent) / income : 0;
    const budgetSummaries = this.computeBudgetSummaries(
      month,
      budgets,
      allocations,
      transactions,
    );

    return {
      month,
      readyToAssign,
      totalAllocated: totalAllocatedThisMonth,
      totalSpent,
      capitalBalance,
      availableFunds,
      savingsRate,
      budgetSummaries,
    };
  }

  private computeCapitalBalance(
    accountBalances: AccountBalanceInput[],
  ): number {
    return accountBalances
      .filter((account) => account.role === 'savings')
      .reduce((sum, account) => sum + account.balance, 0);
  }

  private computeAvailableFunds(
    accountBalances: AccountBalanceInput[],
  ): number {
    return accountBalances
      .filter((account) => account.role === 'operational')
      .reduce((sum, account) => sum + account.balance, 0);
  }

  /**
   * Computes total inflows for the flow-based Ready to Assign calculation.
   *
   * Total inflows = sum(account initial balances) + sum(income transactions) - sum(excluded transactions)
   *
   * Income transactions are credits to operational accounts.
   * Excluded transactions are those marked with excludeFromCalculations = true.
   */
  private computeTotalInflows(
    accountBalances: AccountBalanceInput[],
    transactions: TransactionInput[],
  ): number {
    const initialBalancesSum = this.sumInitialBalances(accountBalances);
    const incomeSum = this.sumIncomeTransactions(transactions);
    const excludedSum = this.sumExcludedTransactions(transactions);

    return initialBalancesSum + incomeSum - excludedSum;
  }

  private sumInitialBalances(accountBalances: AccountBalanceInput[]): number {
    return accountBalances
      .filter((account) => account.role === 'operational')
      .reduce((sum, account) => sum + (account.initialBalance ?? 0), 0);
  }

  private sumIncomeTransactions(transactions: TransactionInput[]): number {
    return transactions
      .filter(
        (transaction) =>
          transaction.type === 'credit' &&
          transaction.accountRole === 'operational' &&
          !transaction.excludeFromCalculations,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  private sumExcludedTransactions(transactions: TransactionInput[]): number {
    return transactions
      .filter(
        (transaction) =>
          transaction.excludeFromCalculations &&
          transaction.accountRole === 'operational',
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  /**
   * Sum of ALL allocations ever (used for Ready to Assign).
   */
  private computeTotalAllocations(allocations: AllocationInput[]): number {
    return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  }

  /**
   * Sum of allocations for a specific month (for display).
   */
  private computeAllocationsForMonth(
    allocations: AllocationInput[],
    month: string,
  ): number {
    return allocations
      .filter((allocation) => allocation.period === month)
      .reduce((sum, allocation) => sum + allocation.amount, 0);
  }

  /**
   * Total expenses from operational accounts in a given month.
   */
  private computeTotalSpentForMonth(
    transactions: TransactionInput[],
    month: string,
  ): number {
    return this.getExpensesForMonth(transactions, month).reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );
  }

  /**
   * Total income from operational accounts in a given month.
   * Excludes transactions marked with excludeFromCalculations.
   */
  private computeIncomeForMonth(
    transactions: TransactionInput[],
    month: string,
  ): number {
    return transactions
      .filter(
        (transaction) =>
          transaction.type === 'credit' &&
          transaction.accountRole === 'operational' &&
          !transaction.excludeFromCalculations &&
          this.isInMonth(transaction.date, month),
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  private computeBudgetSummaries(
    month: string,
    budgets: BudgetInput[],
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): BudgetSummary[] {
    const activeBudgets = budgets.filter((budget) => !budget.isArchived);
    return activeBudgets.map((budget) =>
      this.computeSingleBudgetSummary(month, budget, allocations, transactions),
    );
  }

  /**
   * All budget types use the same accumulating formula:
   * available = SUM(allocated up to month) - SUM(spent up to month)
   */
  private computeSingleBudgetSummary(
    month: string,
    budget: BudgetInput,
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): BudgetSummary {
    const budgetAllocations = allocations.filter(
      (allocation) => allocation.budgetId === budget.budgetId,
    );
    const budgetTransactions = transactions.filter(
      (transaction) => transaction.budgetId === budget.budgetId,
    );

    const allocatedThisMonth = this.sumAllocationsForMonth(
      budgetAllocations,
      month,
    );
    const spentThisMonth = this.sumExpensesForMonth(budgetTransactions, month);
    const totalAllocated = this.sumAllocationsUpToMonth(
      budgetAllocations,
      month,
    );
    const totalSpent = this.sumExpensesUpToMonth(budgetTransactions, month);
    const available = totalAllocated - totalSpent;
    const suggestedAllocation = this.computeSuggestedAllocation(
      available,
      budget,
      month,
    );

    return {
      budgetId: budget.budgetId,
      name: budget.name,
      type: budget.type,
      targetAmount: budget.targetAmount,
      allocated: allocatedThisMonth,
      spent: spentThisMonth,
      available,
      suggestedAllocation,
    };
  }

  /**
   * Computes how much should be allocated this month based on budget type and target.
   *
   * | Type     | Formula                                                       |
   * |----------|---------------------------------------------------------------|
   * | spending | max(0, targetAmount - available)                              |
   * | savings  | max(0, targetAmount - available)                              |
   * | goal     | max(0, ceil((targetAmount - available) / monthsRemaining))    |
   * | periodic | monthly save amount per cadence, 0 if available >= cap        |
   */
  private computeSuggestedAllocation(
    available: number,
    budget: BudgetInput,
    currentMonth: string,
  ): number {
    if (budget.targetAmount <= 0) {
      return 0;
    }

    switch (budget.type) {
      case 'spending':
      case 'savings':
        return Math.max(0, budget.targetAmount - available);

      case 'goal':
        return this.computeGoalSuggestion(available, budget, currentMonth);

      case 'periodic':
        return this.computePeriodicSuggestion(available, budget);
    }
  }

  private computeGoalSuggestion(
    available: number,
    budget: BudgetInput,
    currentMonth: string,
  ): number {
    const remaining = budget.targetAmount - available;
    if (remaining <= 0) {
      return 0;
    }

    if (!budget.targetDate) {
      return remaining;
    }

    const monthsRemaining = this.monthsBetween(currentMonth, budget.targetDate);
    if (monthsRemaining <= 0) {
      return remaining;
    }

    return Math.ceil(remaining / monthsRemaining);
  }

  private computePeriodicSuggestion(
    available: number,
    budget: BudgetInput,
  ): number {
    const monthlyAmount = this.computeMonthlyAmount(budget);
    if (monthlyAmount <= 0) {
      return 0;
    }

    if (budget.cap !== null && budget.cap > 0) {
      return Math.min(monthlyAmount, Math.max(0, budget.cap - available));
    }

    return Math.max(0, monthlyAmount - available);
  }

  private computeMonthlyAmount(budget: BudgetInput): number {
    switch (budget.targetCadence) {
      case 'monthly':
        return budget.targetAmount;
      case 'yearly':
        return Math.ceil(budget.targetAmount / 12);
      case 'custom':
        if (budget.targetCadenceMonths && budget.targetCadenceMonths > 0) {
          return Math.ceil(budget.targetAmount / budget.targetCadenceMonths);
        }
        return budget.targetAmount;
      default:
        return budget.targetAmount;
    }
  }

  /**
   * Returns the number of months from currentMonth to targetDate (inclusive of target month).
   * If targetDate is in the same month, returns 1.
   */
  private monthsBetween(currentMonth: string, targetDate: string): number {
    const currentParts = currentMonth.split('-');
    const currentYear = Number(currentParts[0]);
    const currentMonthNum = Number(currentParts[1]);

    const targetParts = targetDate.slice(0, 7).split('-');
    const targetYear = Number(targetParts[0]);
    const targetMonthNum = Number(targetParts[1]);

    const months =
      (targetYear - currentYear) * 12 + (targetMonthNum - currentMonthNum);
    return Math.max(1, months);
  }

  private sumAllocationsForMonth(
    allocations: AllocationInput[],
    month: string,
  ): number {
    return allocations
      .filter((allocation) => allocation.period === month)
      .reduce((sum, allocation) => sum + allocation.amount, 0);
  }

  private sumAllocationsUpToMonth(
    allocations: AllocationInput[],
    month: string,
  ): number {
    return allocations
      .filter((allocation) => allocation.period <= month)
      .reduce((sum, allocation) => sum + allocation.amount, 0);
  }

  private sumExpensesForMonth(
    transactions: TransactionInput[],
    month: string,
  ): number {
    return this.getExpensesForMonth(transactions, month).reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );
  }

  private sumExpensesUpToMonth(
    transactions: TransactionInput[],
    month: string,
  ): number {
    return transactions
      .filter(
        (transaction) =>
          transaction.type === 'debit' &&
          this.toMonth(transaction.date) <= month,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  private getExpensesForMonth(
    transactions: TransactionInput[],
    month: string,
  ): TransactionInput[] {
    return transactions.filter(
      (transaction) =>
        transaction.type === 'debit' && this.isInMonth(transaction.date, month),
    );
  }

  private isInMonth(date: Date, month: string): boolean {
    return this.toMonth(date) === month;
  }

  private toMonth(date: Date): string {
    const year = date.getFullYear();
    const monthNum = date.getMonth() + 1;
    return `${year}-${String(monthNum).padStart(2, '0')}`;
  }
}
