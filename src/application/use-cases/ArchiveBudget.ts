import { Allocation } from '@domain/entities/Allocation.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
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
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ArchiveBudgetRequestDTO {
  id: number;
}

@injectable()
export class ArchiveBudgetUseCase extends UseCase<
  ArchiveBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private readonly allocationRepository: AllocationRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
  ) {
    super();
  }

  async execute(request: ArchiveBudgetRequestDTO): Promise<Budget> {
    const budget = await this.budgetRepository.findById(request.id);
    if (!budget) {
      throw new BudgetNotFoundError(request.id);
    }

    await this.releaseFundsIfAvailable(request.id);

    const archived = budget.archive();
    return this.budgetRepository.update(archived);
  }

  private async releaseFundsIfAvailable(budgetId: number): Promise<void> {
    const availableBalance = await this.computeAvailableBalance(budgetId);

    if (availableBalance <= 0) {
      return;
    }

    const releaseAllocation = this.buildReleaseAllocation(
      budgetId,
      availableBalance,
    );
    await this.allocationRepository.save(releaseAllocation);
  }

  private async computeAvailableBalance(budgetId: number): Promise<number> {
    const totalAllocated = await this.computeTotalAllocated(budgetId);
    const totalSpent = await this.computeTotalSpent(budgetId);

    return totalAllocated - totalSpent;
  }

  private async computeTotalAllocated(budgetId: number): Promise<number> {
    const allocations =
      await this.allocationRepository.findByBudgetId(budgetId);

    return allocations.reduce(
      (sum, allocation) => sum + allocation.amount.amount,
      0,
    );
  }

  private async computeTotalSpent(budgetId: number): Promise<number> {
    const summaries =
      await this.transactionRepository.findTransactionSummaries();

    return summaries
      .filter(
        (summary) => summary.budgetId === budgetId && summary.type === 'debit',
      )
      .reduce((sum, summary) => sum + summary.amount, 0);
  }

  private buildReleaseAllocation(
    budgetId: number,
    availableBalance: number,
  ): Allocation {
    const amount = Money.create(-availableBalance, Currency.UAH);

    return Allocation.create({
      budgetId,
      amount,
      period: this.getCurrentPeriod(),
      date: new Date(),
      notes: 'Funds released on archive',
    });
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}
