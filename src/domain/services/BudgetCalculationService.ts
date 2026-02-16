import type { CadenceUnit } from '@domain/entities/Budget.ts';

/**
 * Input data for a single budget in monthly overview computation.
 * All monetary values are in minor units (kopecks).
 */
export interface BudgetInput {
  budgetId: number;
  name: string;
  targetAmount: number;
  isArchived: boolean;
  cadenceUnit: CadenceUnit | null;
  cadenceCount: number | null;
  targetDate: string | null;
  cap: number | null;
  startDate: string | null;
  endDate: string | null;
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
  type: 'credit' | 'debit' | 'transfer' | 'returning';
  date: Date;
  accountRole: 'operational' | 'savings';
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
  targetAmount: number;
  allocated: number;
  spent: number;
  available: number;
  suggestedAllocation: number;
  isExpired: boolean;
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
 * All budgets use the accumulating formula:
 * available = SUM(allocated up to month) - SUM(spent up to month)
 *
 * Suggested allocation is derived from budget settings:
 * - Has targetDate → goal formula: spread remaining over months
 * - Has cadenceUnit + cadenceCount → periodic formula: monthly save amount
 * - Neither → simple formula: max(0, target - available)
 * - Cap is applied universally as a post-processing step
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
   * Total inflows = sum(account initial balances) + sum(income transactions)
   *
   * Income transactions are credits to operational accounts that are not transfers.
   */
  private computeTotalInflows(
    accountBalances: AccountBalanceInput[],
    transactions: TransactionInput[],
  ): number {
    const initialBalancesSum = this.sumInitialBalances(accountBalances);
    const incomeSum = this.sumIncomeTransactions(transactions);

    return initialBalancesSum + incomeSum;
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
   * Excludes transfer transactions.
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
    const summaries: BudgetSummary[] = [];

    for (const budget of activeBudgets) {
      const summary = this.computeSingleBudgetSummary(
        month,
        budget,
        allocations,
        transactions,
      );
      if (summary !== null) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  /**
   * All budgets use the same accumulating formula:
   * available = SUM(allocated up to month) - SUM(spent up to month)
   *
   * Returns null when the budget is not visible for the given month.
   * A budget is visible if it's active for the month OR has non-zero available balance.
   */
  private computeSingleBudgetSummary(
    month: string,
    budget: BudgetInput,
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): BudgetSummary | null {
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

    const activeForMonth = this.isBudgetActiveForMonth(budget, month);
    const hasBalance = available !== 0;

    if (!activeForMonth && !hasBalance) {
      return null;
    }

    const isExpired = !activeForMonth && hasBalance;
    const suggestedAllocation = isExpired
      ? 0
      : this.computeSuggestedAllocation(available, budget, month);

    return {
      budgetId: budget.budgetId,
      name: budget.name,
      targetAmount: budget.targetAmount,
      allocated: allocatedThisMonth,
      spent: spentThisMonth,
      available,
      suggestedAllocation,
      isExpired,
    };
  }

  /**
   * Determines whether a budget is active for a given month.
   * Compares at month granularity (YYYY-MM).
   * A budget without start/end dates is always active.
   * For budgets with a targetDate but no explicit endDate, targetDate is used as implicit end date.
   */
  private isBudgetActiveForMonth(budget: BudgetInput, month: string): boolean {
    const startMonth = budget.startDate ? budget.startDate.slice(0, 7) : null;
    const effectiveEndDate = this.getEffectiveEndDate(budget);
    const endMonth = effectiveEndDate ? effectiveEndDate.slice(0, 7) : null;

    if (startMonth && month < startMonth) {
      return false;
    }

    if (endMonth && month > endMonth) {
      return false;
    }

    return true;
  }

  /**
   * Returns the effective end date for a budget.
   * For budgets with a targetDate but no explicit endDate, uses targetDate as implicit end date.
   */
  private getEffectiveEndDate(budget: BudgetInput): string | null {
    if (budget.endDate) {
      return budget.endDate;
    }

    if (budget.targetDate) {
      return budget.targetDate;
    }

    return null;
  }

  /**
   * Computes how much should be allocated this month based on budget settings.
   *
   * Settings-based logic:
   * - Has targetDate → goal formula: ceil((target - available) / monthsRemaining)
   * - Has cadenceUnit + cadenceCount → periodic formula: monthly save amount
   * - Neither → simple formula: max(0, target - available)
   * - Cap is applied universally as a post-processing step
   */
  private computeSuggestedAllocation(
    available: number,
    budget: BudgetInput,
    currentMonth: string,
  ): number {
    if (budget.targetAmount <= 0) {
      return 0;
    }

    let suggestion: number;

    if (budget.targetDate) {
      suggestion = this.computeGoalSuggestion(available, budget, currentMonth);
    } else if (budget.cadenceUnit && budget.cadenceCount) {
      suggestion = this.computePeriodicSuggestion(available, budget);
    } else {
      suggestion = Math.max(0, budget.targetAmount - available);
    }

    if (budget.cap !== null && budget.cap > 0) {
      suggestion = Math.min(suggestion, Math.max(0, budget.cap - available));
    }

    return suggestion;
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

    return Math.max(0, monthlyAmount - available);
  }

  /**
   * Computes the monthly save amount based on cadence unit and count.
   *
   * | Unit   | Monthly amount                              |
   * |--------|---------------------------------------------|
   * | day    | ceil(targetAmount * 365 / (count * 12))     |
   * | week   | ceil(targetAmount * 52 / (count * 12))      |
   * | month  | ceil(targetAmount / count)                  |
   * | year   | ceil(targetAmount / (count * 12))            |
   * | none   | targetAmount (monthly by default)           |
   */
  private computeMonthlyAmount(budget: BudgetInput): number {
    const unit = budget.cadenceUnit;
    const count = budget.cadenceCount;

    if (!unit || !count || count <= 0) {
      return budget.targetAmount;
    }

    switch (unit) {
      case 'day':
        return Math.ceil((budget.targetAmount * 365) / (count * 12));
      case 'week':
        return Math.ceil((budget.targetAmount * 52) / (count * 12));
      case 'month':
        return Math.ceil(budget.targetAmount / count);
      case 'year':
        return Math.ceil(budget.targetAmount / (count * 12));
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
        transaction.type === 'debit' &&
        transaction.accountRole === 'operational' &&
        this.isInMonth(transaction.date, month),
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
