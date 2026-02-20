import { Rule } from '@domain/entities/Rule.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { categorizationRules } from '@modules/database/schema/index.ts';
import { desc, eq } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseCategorizationRuleRepository
  implements CategorizationRuleRepository
{
  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<string[]> {
    const rows = await this.db
      .select({ rule: categorizationRules.rule })
      .from(categorizationRules)
      .orderBy(desc(categorizationRules.priority));
    return rows.map((row) => row.rule.trim()).filter((rule) => Boolean(rule));
  }

  async findAllRules(): Promise<Rule[]> {
    const rows = await this.db
      .select()
      .from(categorizationRules)
      .orderBy(desc(categorizationRules.priority));
    return rows.map((row) => this.mapToEntity(row));
  }

  async findById(id: number): Promise<Rule | null> {
    const rows = await this.db
      .select()
      .from(categorizationRules)
      .where(eq(categorizationRules.id, id));
    const row = rows[0];
    return row ? this.mapToEntity(row) : null;
  }

  async save(rule: Rule): Promise<Rule> {
    const [row] = await this.db
      .insert(categorizationRules)
      .values({
        rule: rule.rule,
        priority: rule.priority,
      })
      .returning();
    if (!row) {
      throw new Error('Failed to insert categorization rule');
    }
    return this.mapToEntity(row);
  }

  async update(rule: Rule): Promise<Rule> {
    const [row] = await this.db
      .update(categorizationRules)
      .set({
        rule: rule.rule,
        priority: rule.priority,
        updatedAt: new Date(),
      })
      .where(eq(categorizationRules.id, rule.id))
      .returning();
    if (!row) {
      throw new Error('Failed to update categorization rule');
    }
    return this.mapToEntity(row);
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(categorizationRules)
      .where(eq(categorizationRules.id, id));
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
