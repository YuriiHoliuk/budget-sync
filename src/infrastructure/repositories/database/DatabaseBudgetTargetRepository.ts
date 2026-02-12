import type { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import type { BudgetTargetRepository } from '@domain/repositories/BudgetTargetRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { budgetTargets } from '@modules/database/schema/index.ts';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseBudgetTargetMapper } from '../../mappers/DatabaseBudgetTargetMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseBudgetTargetRepository implements BudgetTargetRepository {
  private readonly mapper = new DatabaseBudgetTargetMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findByBudgetId(budgetId: number): Promise<BudgetTarget[]> {
    const rows = await this.db
      .select()
      .from(budgetTargets)
      .where(eq(budgetTargets.budgetId, budgetId))
      .orderBy(desc(budgetTargets.effectiveFrom));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findAllForBudgets(budgetIds: number[]): Promise<BudgetTarget[]> {
    if (budgetIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(budgetTargets)
      .where(inArray(budgetTargets.budgetId, budgetIds))
      .orderBy(desc(budgetTargets.effectiveFrom));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findActiveTarget(
    budgetId: number,
    month: string,
  ): Promise<BudgetTarget | null> {
    const rows = await this.db
      .select()
      .from(budgetTargets)
      .where(
        and(
          eq(budgetTargets.budgetId, budgetId),
          lte(budgetTargets.effectiveFrom, month),
        ),
      )
      .orderBy(desc(budgetTargets.effectiveFrom))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async save(target: BudgetTarget): Promise<BudgetTarget> {
    const insertData = this.mapper.toInsert(target);
    const rows = await this.db
      .insert(budgetTargets)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert budget target');
    }
    return this.mapper.toEntity(row);
  }
}
