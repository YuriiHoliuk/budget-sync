import type { Rule } from '@domain/entities/Rule.ts';
import { RuleNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import { UseCase } from './UseCase.ts';

export interface UpdateRuleRequestDTO {
  id: number;
  rule?: string;
  priority?: number;
}

type RuleRepository =
  | CategorizationRuleRepository
  | BudgetizationRuleRepository;

export class UpdateRuleUseCase extends UseCase<UpdateRuleRequestDTO, Rule> {
  constructor(private readonly repository: RuleRepository) {
    super();
  }

  async execute(request: UpdateRuleRequestDTO): Promise<Rule> {
    const existing = await this.repository.findById(request.id);
    if (!existing) {
      throw new RuleNotFoundError(request.id);
    }

    const updated = existing.withUpdatedProps({
      rule: request.rule,
      priority: request.priority,
    });

    return this.repository.update(updated);
  }
}
