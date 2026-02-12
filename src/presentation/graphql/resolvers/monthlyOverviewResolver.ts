import type { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  BUDGET_TARGET_REPOSITORY_TOKEN,
  type BudgetTargetRepository,
} from '@domain/repositories/BudgetTargetRepository.ts';
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
import { mapBudgetGroupToGql, toMajorUnits } from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

@injectable()
export class MonthlyOverviewResolver extends Resolver {
  private calculationService = new BudgetCalculationService();

  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private budgetGroupRepository: BudgetGroupRepository,
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private allocationRepository: AllocationRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(BUDGET_TARGET_REPOSITORY_TOKEN)
    private budgetTargetRepository: BudgetTargetRepository,
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

    const [
      accountBalances,
      budgetInputs,
      allocationInputs,
      transactionInputs,
      budgetMetadata,
      budgetGroups,
    ] = await this.fetchAllData(month);

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
      budgetGroups,
      budgetSummaries: result.budgetSummaries
        .map((summary) => ({
          budgetId: summary.budgetId,
          name: summary.name,
          targetAmount: toMajorUnits(summary.targetAmount),
          allocated: toMajorUnits(summary.allocated),
          spent: toMajorUnits(summary.spent),
          available: toMajorUnits(summary.available),
          suggestedAllocation: toMajorUnits(summary.suggestedAllocation),
          isExpired: summary.isExpired,
          sortOrder: budgetMetadata.get(summary.budgetId)?.sortOrder ?? null,
          budgetGroupId:
            budgetMetadata.get(summary.budgetId)?.budgetGroupId ?? null,
        }))
        .sort((first, second) => {
          if (first.sortOrder === null && second.sortOrder === null) {
            return 0;
          }
          if (first.sortOrder === null) {
            return 1;
          }
          if (second.sortOrder === null) {
            return -1;
          }
          return first.sortOrder < second.sortOrder ? -1 : 1;
        }),
    };
  }

  private validateMonthFormat(month: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error(
        `Invalid month format: "${month}". Expected YYYY-MM (e.g., "2026-02").`,
      );
    }
  }

  private async fetchAllData(
    month: string,
  ): Promise<
    [
      AccountBalanceInput[],
      BudgetInput[],
      AllocationInput[],
      TransactionInput[],
      Map<number, { sortOrder: string | null; budgetGroupId: number | null }>,
      { id: number | null; name: string; sortOrder: string | null }[],
    ]
  > {
    const [accounts, budgets, budgetGroups, allocations, transactionSummaries] =
      await Promise.all([
        this.accountRepository.findAll(),
        this.budgetRepository.findAll(),
        this.budgetGroupRepository.findAll(),
        this.allocationRepository.findAll(),
        this.transactionRepository.findTransactionSummaries(),
      ]);

    const budgetIds = budgets.map((budget) => budget.dbId ?? 0).filter(Boolean);
    const allTargets =
      await this.budgetTargetRepository.findAllForBudgets(budgetIds);

    const targetsByBudgetId = this.groupTargetsByBudgetId(allTargets);

    const budgetMetadata = new Map<
      number,
      { sortOrder: string | null; budgetGroupId: number | null }
    >();

    const accountBalances: AccountBalanceInput[] = accounts.map((account) => ({
      balance: account.balance.amount,
      role: account.role,
      initialBalance: account.initialBalance?.amount,
    }));

    const budgetInputs: BudgetInput[] = budgets.map((budget) => {
      const budgetId = budget.dbId ?? 0;
      budgetMetadata.set(budgetId, {
        sortOrder: budget.sortOrder,
        budgetGroupId: budget.budgetGroupId,
      });
      const historicalTarget = this.findActiveTargetForMonth(
        targetsByBudgetId.get(budgetId) ?? [],
        month,
      );

      return {
        budgetId,
        name: budget.name,
        targetAmount:
          historicalTarget?.targetAmount.amount ?? budget.amount.amount,
        cadenceUnit: budget.cadenceUnit,
        cadenceCount: budget.cadenceCount,
        targetDate: budget.targetDate
          ? budget.targetDate.toISOString().slice(0, 10)
          : null,
        cap: budget.cap?.amount ?? null,
        isArchived: budget.isArchived,
        startDate: budget.startDate
          ? budget.startDate.toISOString().slice(0, 10)
          : null,
        endDate: budget.endDate
          ? budget.endDate.toISOString().slice(0, 10)
          : null,
      };
    });

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
        excludeFromCalculations: summary.excludeFromCalculations,
      }),
    );

    const mappedGroups = budgetGroups.map(mapBudgetGroupToGql);

    return [
      accountBalances,
      budgetInputs,
      allocationInputs,
      transactionInputs,
      budgetMetadata,
      mappedGroups,
    ];
  }

  private groupTargetsByBudgetId(
    targets: BudgetTarget[],
  ): Map<number, BudgetTarget[]> {
    const grouped = new Map<number, BudgetTarget[]>();
    for (const target of targets) {
      const existing = grouped.get(target.budgetId) ?? [];
      existing.push(target);
      grouped.set(target.budgetId, existing);
    }
    return grouped;
  }

  private findActiveTargetForMonth(
    targets: BudgetTarget[],
    month: string,
  ): BudgetTarget | null {
    let activeTarget: BudgetTarget | null = null;
    for (const target of targets) {
      if (target.effectiveFrom <= month) {
        if (
          !activeTarget ||
          target.effectiveFrom > activeTarget.effectiveFrom
        ) {
          activeTarget = target;
        }
      }
    }
    return activeTarget;
  }
}
