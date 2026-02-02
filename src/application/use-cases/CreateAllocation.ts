import { Allocation } from '@domain/entities/Allocation.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
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

export interface CreateAllocationRequestDTO {
  budgetId: number;
  amount: number; // Minor units (kopecks)
  currency: string;
  period: string; // YYYY-MM
  date?: string; // ISO date string, defaults to today
  notes?: string | null;
}

@injectable()
export class CreateAllocationUseCase extends UseCase<
  CreateAllocationRequestDTO,
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

  async execute(request: CreateAllocationRequestDTO): Promise<Allocation> {
    await this.ensureBudgetExists(request.budgetId);

    const allocation = this.buildAllocation(request);
    return this.allocationRepository.save(allocation);
  }

  private async ensureBudgetExists(budgetId: number): Promise<void> {
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new BudgetNotFoundError(budgetId);
    }
  }

  private buildAllocation(request: CreateAllocationRequestDTO): Allocation {
    const currency = Currency.fromCode(request.currency);
    const amount = Money.create(request.amount, currency);

    return Allocation.create({
      budgetId: request.budgetId,
      amount,
      period: request.period,
      date: request.date ? new Date(request.date) : new Date(),
      notes: request.notes ?? null,
    });
  }
}
