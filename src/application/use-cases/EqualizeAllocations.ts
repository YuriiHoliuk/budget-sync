import { Allocation } from '@domain/entities/Allocation.ts';
import type { BudgetType } from '@domain/entities/Budget.ts';
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
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface EqualizeAllocationsRequestDTO {
  period: string; // YYYY-MM
  currency: string;
  budgetIds?: number[];
}

export interface AllocationAdjustment {
  budgetId: number;
  delta: number; // minor units
}

export interface EqualizeAllocationsResultDTO {
  allocationsCreated: number;
  adjustments: AllocationAdjustment[];
}

@injectable()
export class EqualizeAllocationsUseCase extends UseCase<
  EqualizeAllocationsRequestDTO,
  EqualizeAllocationsResultDTO
> {
  private readonly calculationService = new BudgetCalculationService();

  constructor(
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private readonly allocationRepository: AllocationRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(
    request: EqualizeAllocationsRequestDTO,
  ): Promise<EqualizeAllocationsResultDTO> {
    const summaries = await this.computeBudgetSummaries(request.period);
    const adjustments = this.calculateAdjustments(summaries, request.budgetIds);
    const allocations = await this.createAllocations(
      adjustments,
      request.period,
      request.currency,
    );

    return {
      allocationsCreated: allocations.length,
      adjustments,
    };
  }

  private async computeBudgetSummaries(period: string) {
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
      initialBalance: account.initialBalance?.amount,
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
        excludeFromCalculations: summary.excludeFromCalculations,
      }),
    );

    const result = this.calculationService.compute(
      period,
      budgetInputs,
      allocationInputs,
      transactionInputs,
      accountBalances,
    );

    return result.budgetSummaries;
  }

  private calculateAdjustments(
    summaries: {
      budgetId: number;
      type: BudgetType;
      spent: number;
      allocated: number;
    }[],
    budgetIds?: number[],
  ): AllocationAdjustment[] {
    const spendingOnly = summaries.filter(
      (summary) => summary.type === 'spending',
    );

    const filtered = budgetIds
      ? spendingOnly.filter((summary) => budgetIds.includes(summary.budgetId))
      : spendingOnly;

    const adjustments: AllocationAdjustment[] = [];
    for (const summary of filtered) {
      const delta = summary.spent - summary.allocated;
      if (delta !== 0) {
        adjustments.push({ budgetId: summary.budgetId, delta });
      }
    }

    return adjustments;
  }

  private async createAllocations(
    adjustments: AllocationAdjustment[],
    period: string,
    currencyCode: string,
  ): Promise<Allocation[]> {
    const currency = Currency.fromCode(currencyCode);
    const lastDayOfMonth = this.getLastDayOfMonth(period);

    const allocations: Allocation[] = [];
    for (const adjustment of adjustments) {
      const amount = Money.create(adjustment.delta, currency);
      const allocation = Allocation.create({
        budgetId: adjustment.budgetId,
        amount,
        period,
        date: lastDayOfMonth,
        notes: null,
      });
      const saved = await this.allocationRepository.save(allocation);
      allocations.push(saved);
    }

    return allocations;
  }

  private getLastDayOfMonth(period: string): Date {
    const parts = period.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    return new Date(year, month, 0);
  }
}
