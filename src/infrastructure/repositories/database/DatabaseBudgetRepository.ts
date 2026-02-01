import type { Budget } from '@domain/entities/Budget.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { budgets } from '@modules/database/schema/index.ts';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseBudgetMapper } from '../../mappers/DatabaseBudgetMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseBudgetRepository implements BudgetRepository {
  private readonly mapper = new DatabaseBudgetMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<Budget[]> {
    const rows = await this.db.select().from(budgets);
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByName(name: string): Promise<Budget | null> {
    const rows = await this.db
      .select()
      .from(budgets)
      .where(eq(budgets.name, name))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findActive(date: Date): Promise<Budget[]> {
    const dateStr = date.toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.isArchived, false),
          or(isNull(budgets.startDate), lte(budgets.startDate, dateStr)),
          or(isNull(budgets.endDate), gte(budgets.endDate, dateStr)),
        ),
      );
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async save(budget: Budget): Promise<void> {
    const insertData = this.mapper.toInsert(budget);
    await this.db.insert(budgets).values(insertData);
  }

  async saveAndReturn(budget: Budget): Promise<Budget> {
    const insertData = this.mapper.toInsert(budget);
    const rows = await this.db.insert(budgets).values(insertData).returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert budget');
    }
    return this.mapper.toEntity(row);
  }
}
