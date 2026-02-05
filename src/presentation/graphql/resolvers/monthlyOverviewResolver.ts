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
import { inject, injectable } from 'tsyringe';
import { BUDGET_TYPE_TO_GQL, toMajorUnits } from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

@injectable()
export class MonthlyOverviewResolver extends Resolver {
  private calculationService = new BudgetCalculationService();

  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private allocationRepository: AllocationRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        monthlyOverview: (_parent: unknown, args: { month: string }) =>
          this.getMonthlyOverview(args.month),
      },
    };
  }

  private async getMonthlyOverview(month: string) {
    this.validateMonthFormat(month);

    const [accountBalances, budgetInputs, allocationInputs, transactionInputs] =
      await this.fetchAllData();

    const result = this.calculationService.compute(
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
  }

  private validateMonthFormat(month: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error(
        `Invalid month format: "${month}". Expected YYYY-MM (e.g., "2026-02").`,
      );
    }
  }

  private async fetchAllData(): Promise<
    [
      AccountBalanceInput[],
      BudgetInput[],
      AllocationInput[],
      TransactionInput[],
    ]
  > {
    const [accounts, budgets, allocations, transactionSummaries] =
      await Promise.all([
        this.accountRepository.findAll(),
        this.budgetRepository.findAll(),
        this.allocationRepository.findAll(),
        this.transactionRepository.findTransactionSummaries(),
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

    const allocationInputs: AllocationInput[] = allocations.map(
      (allocation) => ({
        budgetId: allocation.budgetId,
        amount: allocation.amount.amount,
        period: allocation.period,
      }),
    );

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
}
