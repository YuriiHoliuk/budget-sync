import type { Allocation } from '@domain/entities/Allocation.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { allocations } from '@modules/database/schema/index.ts';
import { and, eq } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseAllocationMapper } from '../../mappers/DatabaseAllocationMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseAllocationRepository implements AllocationRepository {
  private readonly mapper = new DatabaseAllocationMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<Allocation[]> {
    const rows = await this.db.select().from(allocations);
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findById(id: number): Promise<Allocation | null> {
    const rows = await this.db
      .select()
      .from(allocations)
      .where(eq(allocations.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByBudgetId(budgetId: number): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocations)
      .where(eq(allocations.budgetId, budgetId));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByPeriod(period: string): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocations)
      .where(eq(allocations.period, period));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByBudgetAndPeriod(
    budgetId: number,
    period: string,
  ): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocations)
      .where(
        and(eq(allocations.budgetId, budgetId), eq(allocations.period, period)),
      );
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async save(allocation: Allocation): Promise<Allocation> {
    const insertData = this.mapper.toInsert(allocation);
    const rows = await this.db
      .insert(allocations)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert allocation');
    }
    return this.mapper.toEntity(row);
  }

  async update(allocation: Allocation): Promise<Allocation> {
    const allocationId = allocation.dbId;
    if (!allocationId) {
      throw new Error('Cannot update allocation without database ID');
    }
    const updateData = this.mapper.toInsert(allocation);
    const rows = await this.db
      .update(allocations)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(allocations.id, allocationId))
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error(`Failed to update allocation with id ${allocationId}`);
    }
    return this.mapper.toEntity(row);
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(allocations).where(eq(allocations.id, id));
  }
}
