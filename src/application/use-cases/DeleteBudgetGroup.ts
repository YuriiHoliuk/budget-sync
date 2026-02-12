import { BudgetGroupNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface DeleteBudgetGroupRequestDTO {
  id: number;
}

@injectable()
export class DeleteBudgetGroupUseCase extends UseCase<
  DeleteBudgetGroupRequestDTO,
  boolean
> {
  constructor(
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private readonly budgetGroupRepository: BudgetGroupRepository,
  ) {
    super();
  }

  async execute(request: DeleteBudgetGroupRequestDTO): Promise<boolean> {
    const group = await this.budgetGroupRepository.findById(request.id);
    if (!group) {
      throw new BudgetGroupNotFoundError(request.id);
    }

    await this.budgetGroupRepository.delete(request.id);
    return true;
  }
}
