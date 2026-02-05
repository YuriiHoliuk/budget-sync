import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import {
  type AccountBalanceInput,
  type AllocationInput,
  BudgetCalculationService,
  type BudgetInput,
  type TransactionInput,
} from '@domain/services/BudgetCalculationService.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

const BUDGET_TYPE_TO_GQL: Record<string, string> = {
  spending: 'SPENDING',
  savings: 'SAVINGS',
  goal: 'GOAL',
  periodic: 'PERIODIC',
};

function toMajorUnits(minorUnits: number): number {
  return minorUnits / 100;
}

const calculationService = new BudgetCalculationService();

export const monthlyOverviewResolver = {
  Query: {
    monthlyOverview: async (
      _parent: unknown,
      args: { month: string },
      context: GraphQLContext,
    ) => {
      const { month } = args;
      validateMonthFormat(month);

      const [
        accountBalances,
        budgetInputs,
        allocationInputs,
        transactionInputs,
      ] = await fetchAllData(context);

      const result = calculationService.compute(
        month,
        budgetInputs,
        allocationInputs,
        transactionInputs,
        accountBalances,
      );

      return {
        month: result.month,
        readyToAssign: toMajorUnits(result.readyToAssign),
        totalAllocated: toMajorUnits(result.totalAllocated),
        totalSpent: toMajorUnits(result.totalSpent),
        capitalBalance: toMajorUnits(result.capitalBalance),
        availableFunds: toMajorUnits(result.availableFunds),
        savingsRate: result.savingsRate,
        budgetSummaries: result.budgetSummaries.map((summary) => ({
          budgetId: summary.budgetId,
          name: summary.name,
          type: BUDGET_TYPE_TO_GQL[summary.type] ?? 'SPENDING',
          targetAmount: toMajorUnits(summary.targetAmount),
          allocated: toMajorUnits(summary.allocated),
          spent: toMajorUnits(summary.spent),
          available: toMajorUnits(summary.available),
          carryover: toMajorUnits(summary.carryover),
        })),
      };
    },
  },
};

function validateMonthFormat(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(
      `Invalid month format: "${month}". Expected YYYY-MM (e.g., "2026-02").`,
    );
  }
}

async function fetchAllData(
  context: GraphQLContext,
): Promise<
  [AccountBalanceInput[], BudgetInput[], AllocationInput[], TransactionInput[]]
> {
  const accountRepository = context.container.resolve<AccountRepository>(
    ACCOUNT_REPOSITORY_TOKEN,
  );
  const budgetRepository = context.container.resolve<BudgetRepository>(
    BUDGET_REPOSITORY_TOKEN,
  );
  const allocationRepository = context.container.resolve<AllocationRepository>(
    ALLOCATION_REPOSITORY_TOKEN,
  );
  const transactionRepository =
    context.container.resolve<TransactionRepository>(
      TRANSACTION_REPOSITORY_TOKEN,
    );

  const [accounts, budgets, allocations, transactionSummaries] =
    await Promise.all([
      accountRepository.findAll(),
      budgetRepository.findAll(),
      allocationRepository.findAll(),
      transactionRepository.findTransactionSummaries(),
    ]);

  const accountBalances: AccountBalanceInput[] = accounts.map((account) => ({
    balance: account.balance.amount,
    role: account.role,
  }));

  const budgetInputs: BudgetInput[] = budgets.map((budget) => ({
    budgetId: budget.dbId ?? 0,
    name: budget.name,
    type: budget.type,
    targetAmount: budget.amount.amount,
    isArchived: budget.isArchived,
  }));

  const allocationInputs: AllocationInput[] = allocations.map((allocation) => ({
    budgetId: allocation.budgetId,
    amount: allocation.amount.amount,
    period: allocation.period,
  }));

  const transactionInputs: TransactionInput[] = transactionSummaries.map(
    (summary) => ({
      budgetId: summary.budgetId,
      amount: summary.amount,
      type: summary.type,
      date: summary.date,
      accountRole: summary.accountRole,
    }),
  );

  return [accountBalances, budgetInputs, allocationInputs, transactionInputs];
}
