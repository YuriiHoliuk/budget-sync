import type {
  Budget,
  BudgetType,
  TargetCadence,
} from '@domain/entities/Budget.ts';
import {
  BudgetNameTakenError,
  BudgetNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateBudgetRequestDTO {
  id: number;
  name?: string;
  type?: BudgetType;
  currency?: string;
  targetAmount?: number;
  targetCadence?: TargetCadence | null;
  targetCadenceMonths?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Returns the update value if provided, otherwise the current value */
function resolveField<T>(updated: T | undefined, current: T): T {
  return updated !== undefined ? updated : current;
}

/** Parses a date string if provided, otherwise returns the current date value */
function resolveDate(
  updated: string | null | undefined,
  current: Date | null,
): Date | null {
  if (updated === undefined) {
    return current;
  }
  return updated ? new Date(updated) : null;
}

@injectable()
export class UpdateBudgetUseCase extends UseCase<
  UpdateBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: UpdateBudgetRequestDTO): Promise<Budget> {
    const existing = await this.findBudget(request.id);
    await this.ensureNameIsAvailable(request.name, request.id);

    const updated = this.applyUpdates(existing, request);
    return this.budgetRepository.update(updated);
  }

  private async findBudget(budgetId: number): Promise<Budget> {
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new BudgetNotFoundError(budgetId);
    }
    return budget;
  }

  private async ensureNameIsAvailable(
    name: string | undefined,
    currentId: number,
  ): Promise<void> {
    if (!name) {
      return;
    }
    const existing = await this.budgetRepository.findByName(name);
    if (existing && existing.dbId !== currentId) {
      throw new BudgetNameTakenError(name);
    }
  }

  private applyUpdates(
    budget: Budget,
    request: UpdateBudgetRequestDTO,
  ): Budget {
    const amount = this.resolveAmount(budget, request);

    return budget.withUpdatedProps({
      name: request.name ?? budget.name,
      type: request.type ?? budget.type,
      amount,
      targetCadence: resolveField(request.targetCadence, budget.targetCadence),
      targetCadenceMonths: resolveField(
        request.targetCadenceMonths,
        budget.targetCadenceMonths,
      ),
      targetDate: resolveDate(request.targetDate, budget.targetDate),
      startDate: resolveDate(request.startDate, budget.startDate),
      endDate: resolveDate(request.endDate, budget.endDate),
    });
  }

  private resolveAmount(
    budget: Budget,
    request: UpdateBudgetRequestDTO,
  ): Money {
    const currencyCode = request.currency ?? budget.amount.currency.code;
    const currency = Currency.fromCode(currencyCode);
    const amountValue =
      request.targetAmount !== undefined
        ? request.targetAmount
        : budget.amount.amount;
    return Money.create(amountValue, currency);
  }
}
