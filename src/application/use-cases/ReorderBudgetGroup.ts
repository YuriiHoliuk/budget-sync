import type { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import { BudgetGroupNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import { generateOrderKey } from '@modules/ordering/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ReorderBudgetGroupRequestDTO {
  groupId: number;
  afterGroupId: number | null;
  beforeGroupId: number | null;
}

@injectable()
export class ReorderBudgetGroupUseCase extends UseCase<
  ReorderBudgetGroupRequestDTO,
  BudgetGroup
> {
  constructor(
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private readonly budgetGroupRepository: BudgetGroupRepository,
  ) {
    super();
  }

  async execute(request: ReorderBudgetGroupRequestDTO): Promise<BudgetGroup> {
    const group = await this.findGroupOrThrow(request.groupId);

    const lowerBound = await this.getSortOrderBound(request.afterGroupId);
    const upperBound = await this.getSortOrderBound(request.beforeGroupId);

    const newSortOrder = generateOrderKey(lowerBound, upperBound);

    const updatedGroup = group.withUpdatedProps({ sortOrder: newSortOrder });
    return this.budgetGroupRepository.update(updatedGroup);
  }

  private async findGroupOrThrow(groupId: number): Promise<BudgetGroup> {
    const group = await this.budgetGroupRepository.findById(groupId);
    if (!group) {
      throw new BudgetGroupNotFoundError(groupId);
    }
    return group;
  }

  private async getSortOrderBound(
    groupId: number | null,
  ): Promise<string | null> {
    if (groupId === null) {
      return null;
    }
    const group = await this.budgetGroupRepository.findById(groupId);
    if (!group) {
      throw new BudgetGroupNotFoundError(groupId);
    }
    return group.sortOrder;
  }
}
