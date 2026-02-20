import { Rule } from '@domain/entities/Rule.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import { UseCase } from './UseCase.ts';

export interface CreateRuleRequestDTO {
  rule: string;
  priority?: number;
}

type RuleRepository =
  | CategorizationRuleRepository
  | BudgetizationRuleRepository;

export class CreateRuleUseCase extends UseCase<CreateRuleRequestDTO, Rule> {
  constructor(private readonly repository: RuleRepository) {
    super();
  }

  async execute(request: CreateRuleRequestDTO): Promise<Rule> {
    const rule = Rule.create({
      rule: request.rule,
      priority: request.priority ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await this.repository.save(rule);
  }
}
