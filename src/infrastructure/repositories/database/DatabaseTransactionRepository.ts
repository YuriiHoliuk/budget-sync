import type { Transaction } from '@domain/entities/Transaction.ts';
import type {
  CategorizationUpdate,
  TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { CategorizationStatus } from '@domain/value-objects/index.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import {
  budgets,
  categories,
  transactions,
} from '@modules/database/schema/index.ts';
import type { TransactionRow } from '@modules/database/types.ts';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseTransactionMapper } from '../../mappers/DatabaseTransactionMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

export interface TransactionFilterParams {
  accountId?: number;
  categoryId?: number;
  budgetId?: number;
  type?: string;
  categorizationStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

@injectable()
export class DatabaseTransactionRepository implements TransactionRepository {
  private readonly mapper = new DatabaseTransactionMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  findById(id: string): Promise<Transaction | null> {
    return this.findByExternalId(id);
  }

  async findAll(): Promise<Transaction[]> {
    const rows = await this.db.select().from(transactions);
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByExternalId(externalId: string): Promise<Transaction | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, externalId))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByExternalIds(
    externalIds: string[],
  ): Promise<Map<string, Transaction>> {
    if (externalIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select()
      .from(transactions)
      .where(inArray(transactions.externalId, externalIds));
    const resultMap = new Map<string, Transaction>();
    for (const row of rows) {
      const entity = this.mapper.toEntity(row);
      resultMap.set(entity.externalId, entity);
    }
    return resultMap;
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountExternalId, accountId));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async save(transaction: Transaction): Promise<void> {
    const insertData = this.mapper.toInsert(transaction);
    await this.db.insert(transactions).values(insertData);
  }

  async saveAndReturn(transaction: Transaction): Promise<Transaction> {
    const insertData = this.mapper.toInsert(transaction);
    const rows = await this.db
      .insert(transactions)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert transaction');
    }
    return this.mapper.toEntity(row);
  }

  async saveMany(transactionList: Transaction[]): Promise<void> {
    if (transactionList.length === 0) {
      return;
    }
    const insertData = transactionList.map((transaction) =>
      this.mapper.toInsert(transaction),
    );
    await this.db.insert(transactions).values(insertData);
  }

  async saveManyAndReturn(
    transactionList: Transaction[],
  ): Promise<Transaction[]> {
    if (transactionList.length === 0) {
      return [];
    }
    const insertData = transactionList.map((transaction) =>
      this.mapper.toInsert(transaction),
    );
    const rows = await this.db
      .insert(transactions)
      .values(insertData)
      .returning();
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async update(transaction: Transaction): Promise<void> {
    const insertData = this.mapper.toInsert(transaction);
    await this.db
      .update(transactions)
      .set(insertData)
      .where(eq(transactions.externalId, transaction.externalId));
  }

  async updateMany(transactionList: Transaction[]): Promise<void> {
    for (const transaction of transactionList) {
      await this.update(transaction);
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(transactions).where(eq(transactions.externalId, id));
  }

  async updateCategorization(
    externalId: string,
    data: CategorizationUpdate,
  ): Promise<void> {
    const categoryDbId = await this.resolveCategoryId(data.category);
    const budgetDbId = await this.resolveBudgetId(data.budget);

    await this.db
      .update(transactions)
      .set({
        categoryId: categoryDbId,
        budgetId: budgetDbId,
        categoryReason: data.categoryReason,
        budgetReason: data.budgetReason,
        categorizationStatus: data.status,
      })
      .where(eq(transactions.externalId, externalId));
  }

  async findByCategorizationStatus(
    status: CategorizationStatus,
  ): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        or(
          eq(transactions.categorizationStatus, status),
          status === 'pending'
            ? isNull(transactions.categorizationStatus)
            : undefined,
        ),
      );
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findUncategorized(): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(isNull(transactions.categoryId), isNull(transactions.budgetId)),
      );
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findRowByDbId(dbId: number): Promise<TransactionRow | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, dbId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findRowsFiltered(
    filter: TransactionFilterParams,
    pagination: PaginationParams,
  ): Promise<TransactionRow[]> {
    const conditions = this.buildFilterConditions(filter);
    return await this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }

  async countFiltered(filter: TransactionFilterParams): Promise<number> {
    const conditions = this.buildFilterConditions(filter);
    const result = await this.db
      .select({ total: count() })
      .from(transactions)
      .where(and(...conditions));
    return result[0]?.total ?? 0;
  }

  async updateCategoryByDbId(
    dbId: number,
    categoryId: number | null,
  ): Promise<TransactionRow | null> {
    const rows = await this.db
      .update(transactions)
      .set({ categoryId, updatedAt: new Date() })
      .where(eq(transactions.id, dbId))
      .returning();
    return rows[0] ?? null;
  }

  async updateBudgetByDbId(
    dbId: number,
    budgetId: number | null,
  ): Promise<TransactionRow | null> {
    const rows = await this.db
      .update(transactions)
      .set({ budgetId, updatedAt: new Date() })
      .where(eq(transactions.id, dbId))
      .returning();
    return rows[0] ?? null;
  }

  async updateStatusByDbId(
    dbId: number,
    status: CategorizationStatus,
  ): Promise<TransactionRow | null> {
    const rows = await this.db
      .update(transactions)
      .set({ categorizationStatus: status, updatedAt: new Date() })
      .where(eq(transactions.id, dbId))
      .returning();
    return rows[0] ?? null;
  }

  private buildFilterConditions(filter: TransactionFilterParams): SQL[] {
    const conditions: SQL[] = [];

    if (filter.accountId !== undefined) {
      conditions.push(eq(transactions.accountId, filter.accountId));
    }
    if (filter.categoryId !== undefined) {
      conditions.push(eq(transactions.categoryId, filter.categoryId));
    }
    if (filter.budgetId !== undefined) {
      conditions.push(eq(transactions.budgetId, filter.budgetId));
    }
    if (filter.type) {
      conditions.push(eq(transactions.type, filter.type.toLowerCase()));
    }
    if (filter.categorizationStatus) {
      conditions.push(
        eq(
          transactions.categorizationStatus,
          filter.categorizationStatus.toLowerCase(),
        ),
      );
    }
    if (filter.dateFrom) {
      conditions.push(gte(transactions.date, new Date(filter.dateFrom)));
    }
    if (filter.dateTo) {
      conditions.push(lte(transactions.date, new Date(filter.dateTo)));
    }
    if (filter.search) {
      const searchPattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(transactions.bankDescription, searchPattern),
          ilike(transactions.counterparty, searchPattern),
        ) as SQL,
      );
    }
    return conditions;
  }

  private async resolveCategoryId(
    categoryName: string | null,
  ): Promise<number | null> {
    if (!categoryName) {
      return null;
    }
    const rows = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, categoryName))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  private async resolveBudgetId(
    budgetName: string | null,
  ): Promise<number | null> {
    if (!budgetName) {
      return null;
    }
    const rows = await this.db
      .select({ id: budgets.id })
      .from(budgets)
      .where(eq(budgets.name, budgetName))
      .limit(1);
    return rows[0]?.id ?? null;
  }
}
