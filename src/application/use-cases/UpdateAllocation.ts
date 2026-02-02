import type { Allocation } from '@domain/entities/Allocation.ts';
import {
  AllocationNotFoundError,
  BudgetNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateAllocationRequestDTO {
  id: number;
  budgetId?: number;
  amount?: number; // Minor units (kopecks)
  currency?: string;
  period?: string; // YYYY-MM
  date?: string; // ISO date string
  notes?: string | null;
}

@injectable()
export class UpdateAllocationUseCase extends UseCase<
  UpdateAllocationRequestDTO,
  Allocation
> {
  constructor(
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private readonly allocationRepository: AllocationRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: UpdateAllocationRequestDTO): Promise<Allocation> {
    const existing = await this.findAllocation(request.id);

    if (request.budgetId !== undefined) {
      await this.ensureBudgetExists(request.budgetId);
    }

    const updated = this.applyUpdates(existing, request);
    return this.allocationRepository.update(updated);
  }

  private async findAllocation(allocationId: number): Promise<Allocation> {
    const allocation = await this.allocationRepository.findById(allocationId);
    if (!allocation) {
      throw new AllocationNotFoundError(allocationId);
    }
    return allocation;
  }

  private async ensureBudgetExists(budgetId: number): Promise<void> {
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new BudgetNotFoundError(budgetId);
    }
  }

  private applyUpdates(
    allocation: Allocation,
    request: UpdateAllocationRequestDTO,
  ): Allocation {
    const amount = this.resolveAmount(allocation, request);

    return allocation.withUpdatedProps({
      budgetId: request.budgetId ?? allocation.budgetId,
      amount,
      period: request.period ?? allocation.period,
      date: request.date ? new Date(request.date) : allocation.date,
      notes: request.notes !== undefined ? request.notes : allocation.notes,
    });
  }

  private resolveAmount(
    allocation: Allocation,
    request: UpdateAllocationRequestDTO,
  ): Money {
    const currencyCode = request.currency ?? allocation.amount.currency.code;
    const currency = Currency.fromCode(currencyCode);
    const amountValue =
      request.amount !== undefined ? request.amount : allocation.amount.amount;
    return Money.create(amountValue, currency);
  }
}
