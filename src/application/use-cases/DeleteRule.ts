import { RuleNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import { UseCase } from './UseCase.ts';

export interface DeleteRuleRequestDTO {
  id: number;
}

type RuleRepository =
  | CategorizationRuleRepository
  | BudgetizationRuleRepository;

export class DeleteRuleUseCase extends UseCase<DeleteRuleRequestDTO, void> {
  constructor(private readonly repository: RuleRepository) {
    super();
  }

  async execute(request: DeleteRuleRequestDTO): Promise<void> {
    const existing = await this.repository.findById(request.id);
    if (!existing) {
      throw new RuleNotFoundError(request.id);
    }

    await this.repository.delete(request.id);
  }
}
