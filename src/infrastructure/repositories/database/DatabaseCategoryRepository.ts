import type { Category } from '@domain/entities/Category.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { categories } from '@modules/database/schema/index.ts';
import { eq } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseCategoryMapper } from '../../mappers/DatabaseCategoryMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseCategoryRepository implements CategoryRepository {
  private readonly mapper = new DatabaseCategoryMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async findAll(): Promise<Category[]> {
    const rows = await this.db.select().from(categories);
    const parentMap = this.buildParentNameMap(rows);
    return rows.map((row) =>
      this.mapper.toEntity(row, parentMap.get(row.parentId ?? -1)),
    );
  }

  async findByName(name: string): Promise<Category | null> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const parentName = await this.resolveParentName(row.parentId);
    return this.mapper.toEntity(row, parentName);
  }

  async findActive(): Promise<Category[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.status, CategoryStatus.ACTIVE));
    const parentMap = this.buildParentNameMap(rows);
    return rows.map((row) =>
      this.mapper.toEntity(row, parentMap.get(row.parentId ?? -1)),
    );
  }

  async save(category: Category): Promise<void> {
    const parentDbId = await this.resolveParentId(category.parent);
    const insertData = this.mapper.toInsert(category, parentDbId ?? undefined);
    await this.db.insert(categories).values(insertData);
  }

  async saveAndReturn(category: Category): Promise<Category> {
    const parentDbId = await this.resolveParentId(category.parent);
    const insertData = this.mapper.toInsert(category, parentDbId ?? undefined);
    const rows = await this.db
      .insert(categories)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert category');
    }
    return this.mapper.toEntity(row, category.parent);
  }

  private buildParentNameMap(
    rows: Array<{ id: number; name: string; parentId: number | null }>,
  ): Map<number, string> {
    const idToName = new Map<number, string>();
    for (const row of rows) {
      idToName.set(row.id, row.name);
    }
    return idToName;
  }

  private async resolveParentName(
    parentId: number | null,
  ): Promise<string | undefined> {
    if (parentId == null) {
      return undefined;
    }
    const rows = await this.db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, parentId))
      .limit(1);
    return rows[0]?.name;
  }

  private async resolveParentId(
    parentName: string | undefined,
  ): Promise<number | null> {
    if (!parentName) {
      return null;
    }
    const rows = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, parentName))
      .limit(1);
    return rows[0]?.id ?? null;
  }
}
