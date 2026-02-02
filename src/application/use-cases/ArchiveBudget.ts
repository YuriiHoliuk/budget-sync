import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ArchiveBudgetRequestDTO {
  id: number;
}

@injectable()
export class ArchiveBudgetUseCase extends UseCase<
  ArchiveBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: ArchiveBudgetRequestDTO): Promise<Budget> {
    const budget = await this.budgetRepository.findById(request.id);
    if (!budget) {
      throw new BudgetNotFoundError(request.id);
    }

    const archived = budget.archive();
    return this.budgetRepository.update(archived);
  }
}
