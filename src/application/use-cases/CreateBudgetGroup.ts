import { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import { BudgetGroupNameEmptyError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import { generateOrderKey } from '@modules/ordering/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateBudgetGroupRequestDTO {
  name: string;
}

@injectable()
export class CreateBudgetGroupUseCase extends UseCase<
  CreateBudgetGroupRequestDTO,
  BudgetGroup
> {
  constructor(
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private readonly budgetGroupRepository: BudgetGroupRepository,
  ) {
    super();
  }

  async execute(request: CreateBudgetGroupRequestDTO): Promise<BudgetGroup> {
    this.validateName(request.name);

    const sortOrder = await this.generateNextSortOrder();
    const group = BudgetGroup.create({
      name: request.name,
      sortOrder,
    });

    return this.budgetGroupRepository.save(group);
  }

  private validateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new BudgetGroupNameEmptyError();
    }
  }

  private async generateNextSortOrder(): Promise<string> {
    const allGroups = await this.budgetGroupRepository.findAll();
    const lastSortOrder =
      allGroups.length > 0
        ? (allGroups[allGroups.length - 1]?.sortOrder ?? null)
        : null;
    return generateOrderKey(lastSortOrder, null);
  }
}
