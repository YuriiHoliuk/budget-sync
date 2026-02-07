import type { BudgetType } from '@domain/entities/Budget.ts';

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
  carryover: number;
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

    if (budget.type === 'spending') {
      return this.computeSpendingBudget(
        month,
        budget,
        budgetAllocations,
        budgetTransactions,
      );
    }

    return this.computeAccumulatingBudget(
      month,
      budget,
      budgetAllocations,
      budgetTransactions,
    );
  }

  /**
   * Spending budgets: reset monthly, only negative carryover carries forward.
   *
   * Available = Allocated this month - Spent this month + Carryover
   * Carryover = Only negative balance from previous month
   */
  private computeSpendingBudget(
    month: string,
    budget: BudgetInput,
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): BudgetSummary {
    const allocatedThisMonth = this.sumAllocationsForMonth(allocations, month);
    const spentThisMonth = this.sumExpensesForMonth(transactions, month);
    const carryover = this.computeSpendingCarryover(
      month,
      allocations,
      transactions,
    );
    const available = allocatedThisMonth - spentThisMonth + carryover;

    return {
      budgetId: budget.budgetId,
      name: budget.name,
      type: budget.type,
      targetAmount: budget.targetAmount,
      allocated: allocatedThisMonth,
      spent: spentThisMonth,
      available,
      carryover,
    };
  }

  /**
   * Savings / Goal / Periodic budgets: accumulate over time.
   *
   * Available = Sum of all allocations (all time up to month) - Sum of all spending (all time up to month)
   */
  private computeAccumulatingBudget(
    month: string,
    budget: BudgetInput,
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): BudgetSummary {
    const allocatedThisMonth = this.sumAllocationsForMonth(allocations, month);
    const spentThisMonth = this.sumExpensesForMonth(transactions, month);
    const totalAllocated = this.sumAllocationsUpToMonth(allocations, month);
    const totalSpent = this.sumExpensesUpToMonth(transactions, month);
    const available = totalAllocated - totalSpent;

    return {
      budgetId: budget.budgetId,
      name: budget.name,
      type: budget.type,
      targetAmount: budget.targetAmount,
      allocated: allocatedThisMonth,
      spent: spentThisMonth,
      available,
      carryover: 0,
    };
  }

  /**
   * For spending budgets, compute carryover from all previous months.
   * Only negative balances carry forward (overspending as debt).
   * Positive leftover does NOT carry forward.
   */
  private computeSpendingCarryover(
    currentMonth: string,
    allocations: AllocationInput[],
    transactions: TransactionInput[],
  ): number {
    const previousMonths = this.getPreviousMonths(
      allocations,
      transactions,
      currentMonth,
    );
    let carryover = 0;

    for (const previousMonth of previousMonths) {
      const allocated = this.sumAllocationsForMonth(allocations, previousMonth);
      const spent = this.sumExpensesForMonth(transactions, previousMonth);
      const balance = allocated - spent + carryover;
      // Only negative balance carries forward for spending budgets
      carryover = balance < 0 ? balance : 0;
    }

    return carryover;
  }

  /**
   * Get sorted list of unique months before the current month,
   * from both allocations and transactions.
   */
  private getPreviousMonths(
    allocations: AllocationInput[],
    transactions: TransactionInput[],
    currentMonth: string,
  ): string[] {
    const months = new Set<string>();

    for (const allocation of allocations) {
      if (allocation.period < currentMonth) {
        months.add(allocation.period);
      }
    }

    for (const transaction of transactions) {
      const transactionMonth = this.toMonth(transaction.date);
      if (transactionMonth < currentMonth) {
        months.add(transactionMonth);
      }
    }

    return Array.from(months).sort();
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
