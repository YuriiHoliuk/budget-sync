import { Rule } from '@domain/entities/Rule.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { budgetizationRules } from '@modules/database/schema/index.ts';
import { desc, eq } from 'drizzle-orm';
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

  async findAllRules(): Promise<Rule[]> {
    const rows = await this.db
      .select()
      .from(budgetizationRules)
      .orderBy(desc(budgetizationRules.priority));
    return rows.map((row) => this.mapToEntity(row));
  }

  async findById(id: number): Promise<Rule | null> {
    const rows = await this.db
      .select()
      .from(budgetizationRules)
      .where(eq(budgetizationRules.id, id));
    const row = rows[0];
    return row ? this.mapToEntity(row) : null;
  }

  async save(rule: Rule): Promise<Rule> {
    const [row] = await this.db
      .insert(budgetizationRules)
      .values({
        rule: rule.rule,
        priority: rule.priority,
      })
      .returning();
    if (!row) {
      throw new Error('Failed to insert budgetization rule');
    }
    return this.mapToEntity(row);
  }

  async update(rule: Rule): Promise<Rule> {
    const [row] = await this.db
      .update(budgetizationRules)
      .set({
        rule: rule.rule,
        priority: rule.priority,
        updatedAt: new Date(),
      })
      .where(eq(budgetizationRules.id, rule.id))
      .returning();
    if (!row) {
      throw new Error('Failed to update budgetization rule');
    }
    return this.mapToEntity(row);
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(budgetizationRules)
      .where(eq(budgetizationRules.id, id));
  }

  private mapToEntity(row: {
    id: number;
    rule: string;
    priority: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  }): Rule {
    return Rule.create({
      rule: row.rule,
      priority: row.priority ?? 0,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
      dbId: row.id,
    });
  }
}
