import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_CATEGORIZATION_RULE_REPOSITORY_TOKEN } from './database/tokens.ts';

@injectable()
export class DualWriteCategorizationRuleRepository
  implements CategorizationRuleRepository
{
  constructor(
    @inject(DATABASE_CATEGORIZATION_RULE_REPOSITORY_TOKEN)
    private readonly dbRepo: CategorizationRuleRepository,
  ) {}

  findAll(): Promise<string[]> {
    return this.dbRepo.findAll();
  }
}
