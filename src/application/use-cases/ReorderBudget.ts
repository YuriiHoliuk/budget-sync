import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { generateOrderKey } from '@modules/ordering/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ReorderBudgetRequestDTO {
  budgetId: number;
  afterBudgetId: number | null;
  beforeBudgetId: number | null;
  /** Optional group ID to move budget into (for cross-group drag) */
  budgetGroupId?: number | null;
}

@injectable()
export class ReorderBudgetUseCase extends UseCase<
  ReorderBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: ReorderBudgetRequestDTO): Promise<Budget> {
    const budget = await this.findBudgetOrThrow(request.budgetId);

    const lowerBound = await this.getSortOrderBound(request.afterBudgetId);
    const upperBound = await this.getSortOrderBound(request.beforeBudgetId);

    const newSortOrder = generateOrderKey(lowerBound, upperBound);

    const updates: { sortOrder: string; budgetGroupId?: number | null } = {
      sortOrder: newSortOrder,
    };

    // Update group if explicitly provided (including null to ungroup)
    if (request.budgetGroupId !== undefined) {
      updates.budgetGroupId = request.budgetGroupId;
    }

    const updatedBudget = budget.withUpdatedProps(updates);
    return this.budgetRepository.update(updatedBudget);
  }

  private async findBudgetOrThrow(budgetId: number): Promise<Budget> {
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new BudgetNotFoundError(budgetId);
    }
    return budget;
  }

  private async getSortOrderBound(
    budgetId: number | null,
  ): Promise<string | null> {
    if (budgetId === null) {
      return null;
    }
    const budget = await this.budgetRepository.findById(budgetId);
    if (!budget) {
      throw new BudgetNotFoundError(budgetId);
    }
    return budget.sortOrder;
  }
}
