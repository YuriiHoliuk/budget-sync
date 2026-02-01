import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_BUDGETIZATION_RULE_REPOSITORY_TOKEN } from './database/tokens.ts';

@injectable()
export class DualWriteBudgetizationRuleRepository
  implements BudgetizationRuleRepository
{
  constructor(
    @inject(DATABASE_BUDGETIZATION_RULE_REPOSITORY_TOKEN)
    private readonly dbRepo: BudgetizationRuleRepository,
  ) {}

  findAll(): Promise<string[]> {
    return this.dbRepo.findAll();
  }
}
