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

export interface MoveFundsRequestDTO {
  sourceBudgetId: number;
  destBudgetId: number;
  amount: number; // Minor units (kopecks), must be positive
  currency: string;
  period: string; // YYYY-MM
  date?: string; // ISO date string, defaults to today
  notes?: string | null;
}

export interface MoveFundsResultDTO {
  sourceAllocation: Allocation;
  destAllocation: Allocation;
}

@injectable()
export class MoveFundsUseCase extends UseCase<
  MoveFundsRequestDTO,
  MoveFundsResultDTO
> {
  constructor(
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private readonly allocationRepository: AllocationRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: MoveFundsRequestDTO): Promise<MoveFundsResultDTO> {
    this.validateAmount(request.amount);
    await this.ensureBudgetsExist(request.sourceBudgetId, request.destBudgetId);

    return this.createPairedAllocations(request);
  }

  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Move amount must be positive');
    }
  }

  private async ensureBudgetsExist(
    sourceBudgetId: number,
    destBudgetId: number,
  ): Promise<void> {
    const sourceBudget = await this.budgetRepository.findById(sourceBudgetId);
    if (!sourceBudget) {
      throw new BudgetNotFoundError(sourceBudgetId);
    }

    const destBudget = await this.budgetRepository.findById(destBudgetId);
    if (!destBudget) {
      throw new BudgetNotFoundError(destBudgetId);
    }
  }

  private async createPairedAllocations(
    request: MoveFundsRequestDTO,
  ): Promise<MoveFundsResultDTO> {
    const currency = Currency.fromCode(request.currency);
    const positiveAmount = Money.create(request.amount, currency);
    const negativeAmount = positiveAmount.negate();
    const date = request.date ? new Date(request.date) : new Date();

    const sourceAllocation = Allocation.create({
      budgetId: request.sourceBudgetId,
      amount: negativeAmount,
      period: request.period,
      date,
      notes: request.notes ?? null,
    });

    const destAllocation = Allocation.create({
      budgetId: request.destBudgetId,
      amount: positiveAmount,
      period: request.period,
      date,
      notes: request.notes ?? null,
    });

    const savedSource = await this.allocationRepository.save(sourceAllocation);
    const savedDest = await this.allocationRepository.save(destAllocation);

    return {
      sourceAllocation: savedSource,
      destAllocation: savedDest,
    };
  }
}
