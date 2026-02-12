import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import {
  BudgetNameTakenError,
  BudgetNotFoundError,
  InvalidBudgetEndDateError,
} from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  BUDGET_TARGET_REPOSITORY_TOKEN,
  type BudgetTargetRepository,
} from '@domain/repositories/BudgetTargetRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateBudgetRequestDTO {
  id: number;
  /** YYYY-MM format. Required for endDate validation and target history. */
  month: string;
  name?: string;
  targetAmount?: number;
  endDate?: string | null;
  cap?: number | null;
  budgetGroupId?: number | null;
}

@injectable()
export class UpdateBudgetUseCase extends UseCase<
  UpdateBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
    @inject(BUDGET_TARGET_REPOSITORY_TOKEN)
    private readonly budgetTargetRepository: BudgetTargetRepository,
  ) {
    super();
  }

  async execute(request: UpdateBudgetRequestDTO): Promise<Budget> {
    const existing = await this.findBudget(request.id);
    await this.ensureNameIsAvailable(request.name, request.id);

    const updated = this.applyUpdates(existing, request);
    const savedBudget = await this.budgetRepository.update(updated);

    await this.createTargetHistoryIfNeeded(existing, request);

    return savedBudget;
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
    const cap = this.resolveCap(budget, request, amount.currency);
    const endDate = this.resolveEndDate(budget, request);

    const updates: Parameters<typeof budget.withUpdatedProps>[0] = {
      name: request.name ?? budget.name,
      amount,
      endDate,
      cap,
    };

    // Update group if explicitly provided (undefined means don't change)
    if (request.budgetGroupId !== undefined) {
      updates.budgetGroupId = request.budgetGroupId;
    }

    return budget.withUpdatedProps(updates);
  }

  private async createTargetHistoryIfNeeded(
    existing: Budget,
    request: UpdateBudgetRequestDTO,
  ): Promise<void> {
    if (request.targetAmount === undefined) {
      return;
    }
    if (request.targetAmount === existing.amount.amount) {
      return;
    }

    const budgetId = existing.dbId;
    if (!budgetId) {
      return;
    }

    const currency = existing.amount.currency;
    const newAmount = Money.create(request.targetAmount, currency);

    const target = BudgetTarget.create({
      budgetId,
      targetAmount: newAmount,
      effectiveFrom: request.month,
    });

    await this.budgetTargetRepository.save(target);
  }

  private resolveCap(
    budget: Budget,
    request: UpdateBudgetRequestDTO,
    currency: Currency,
  ): Money | null {
    if (request.cap === undefined) {
      return budget.cap;
    }
    return request.cap != null ? Money.create(request.cap, currency) : null;
  }

  private resolveAmount(
    budget: Budget,
    request: UpdateBudgetRequestDTO,
  ): Money {
    const currency = budget.amount.currency;
    const amountValue =
      request.targetAmount !== undefined
        ? request.targetAmount
        : budget.amount.amount;
    return Money.create(amountValue, currency);
  }

  private resolveEndDate(
    budget: Budget,
    request: UpdateBudgetRequestDTO,
  ): Date | null {
    if (request.endDate === undefined) {
      return budget.endDate;
    }

    if (request.endDate === null || request.endDate === '') {
      return null;
    }

    const endDateString = request.endDate;
    const endDateValue = new Date(endDateString);
    const minDate = this.getFirstDayOfMonth(request.month);

    if (endDateValue < minDate) {
      const minDateString = minDate.toISOString().split('T')[0] ?? '';
      throw new InvalidBudgetEndDateError(endDateString, minDateString);
    }

    return endDateValue;
  }

  private getFirstDayOfMonth(month: string): Date {
    return new Date(`${month}-01T00:00:00.000Z`);
  }
}
