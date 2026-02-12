import type { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import {
  BudgetGroupNameEmptyError,
  BudgetGroupNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateBudgetGroupRequestDTO {
  id: number;
  name: string;
}

@injectable()
export class UpdateBudgetGroupUseCase extends UseCase<
  UpdateBudgetGroupRequestDTO,
  BudgetGroup
> {
  constructor(
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private readonly budgetGroupRepository: BudgetGroupRepository,
  ) {
    super();
  }

  async execute(request: UpdateBudgetGroupRequestDTO): Promise<BudgetGroup> {
    this.validateName(request.name);

    const group = await this.budgetGroupRepository.findById(request.id);
    if (!group) {
      throw new BudgetGroupNotFoundError(request.id);
    }

    const updatedGroup = group.withUpdatedProps({ name: request.name });
    return this.budgetGroupRepository.update(updatedGroup);
  }

  private validateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new BudgetGroupNameEmptyError();
    }
  }
}
