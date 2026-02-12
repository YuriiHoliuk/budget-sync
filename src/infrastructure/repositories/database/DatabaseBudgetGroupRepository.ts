import type { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import type { BudgetGroupRepository } from '@domain/repositories/BudgetGroupRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { budgetGroups } from '@modules/database/schema/index.ts';
import { asc, eq } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseBudgetGroupMapper } from '../../mappers/DatabaseBudgetGroupMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseBudgetGroupRepository implements BudgetGroupRepository {
  private readonly mapper = new DatabaseBudgetGroupMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<BudgetGroup[]> {
    const rows = await this.db
      .select()
      .from(budgetGroups)
      .orderBy(asc(budgetGroups.sortOrder));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findById(id: number): Promise<BudgetGroup | null> {
    const rows = await this.db
      .select()
      .from(budgetGroups)
      .where(eq(budgetGroups.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async save(group: BudgetGroup): Promise<BudgetGroup> {
    const insertData = this.mapper.toInsert(group);
    const rows = await this.db
      .insert(budgetGroups)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert budget group');
    }
    return this.mapper.toEntity(row);
  }

  async update(group: BudgetGroup): Promise<BudgetGroup> {
    const groupId = group.dbId;
    if (!groupId) {
      throw new Error('Cannot update budget group without database ID');
    }
    const updateData = this.mapper.toInsert(group);
    const rows = await this.db
      .update(budgetGroups)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(budgetGroups.id, groupId))
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error(`Failed to update budget group with id ${groupId}`);
    }
    return this.mapper.toEntity(row);
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(budgetGroups).where(eq(budgetGroups.id, id));
  }
}
