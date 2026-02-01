import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { budgetizationRules } from '@modules/database/schema/index.ts';
import { desc } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseBudgetizationRuleRepository
  implements BudgetizationRuleRepository
{
  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<string[]> {
    const rows = await this.db
      .select({ rule: budgetizationRules.rule })
      .from(budgetizationRules)
      .orderBy(desc(budgetizationRules.priority));
    return rows.map((row) => row.rule.trim()).filter((rule) => Boolean(rule));
  }
}
