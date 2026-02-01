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
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseTransactionMapper } from '../../mappers/DatabaseTransactionMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

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
