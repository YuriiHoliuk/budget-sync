import type { BankTransaction } from '@domain/entities/BankTransaction.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import {
  bankTransactions,
  transactionSources,
} from '@modules/database/schema/index.ts';
import { and, between, eq, inArray } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseBankTransactionMapper } from '../../mappers/DatabaseBankTransactionMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseBankTransactionRepository
  implements BankTransactionRepository
{
  private readonly mapper = new DatabaseBankTransactionMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  async save(bankTransaction: BankTransaction): Promise<BankTransaction> {
    const insertData = this.mapper.toInsert(bankTransaction);
    const rows = await this.db
      .insert(bankTransactions)
      .values(insertData)
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert bank transaction');
    }
    return this.mapper.toEntity(row);
  }

  async saveMany(
    bankTransactionList: BankTransaction[],
  ): Promise<BankTransaction[]> {
    if (bankTransactionList.length === 0) {
      return [];
    }
    const insertData = bankTransactionList.map((bankTxn) =>
      this.mapper.toInsert(bankTxn),
    );
    const rows = await this.db
      .insert(bankTransactions)
      .values(insertData)
      .returning();
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByExternalId(externalId: string): Promise<BankTransaction | null> {
    const rows = await this.db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.externalId, externalId))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByExternalIds(
    externalIds: string[],
  ): Promise<Map<string, BankTransaction>> {
    if (externalIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select()
      .from(bankTransactions)
      .where(inArray(bankTransactions.externalId, externalIds));
    const resultMap = new Map<string, BankTransaction>();
    for (const row of rows) {
      const entity = this.mapper.toEntity(row);
      resultMap.set(entity.externalId, entity);
    }
    return resultMap;
  }

  async findByAccountAndDateRange(
    accountId: number,
    from: Date,
    to: Date,
  ): Promise<BankTransaction[]> {
    const rows = await this.db
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.accountId, accountId),
          between(bankTransactions.date, from, to),
        ),
      );
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByTransactionId(transactionId: number): Promise<BankTransaction[]> {
    const rows = await this.db
      .select({ bankTransaction: bankTransactions })
      .from(transactionSources)
      .innerJoin(
        bankTransactions,
        eq(transactionSources.bankTransactionId, bankTransactions.id),
      )
      .where(eq(transactionSources.transactionId, transactionId));
    return rows.map((row) => this.mapper.toEntity(row.bankTransaction));
  }

  async linkTransactionSource(
    transactionId: number,
    bankTransactionId: number,
  ): Promise<void> {
    await this.db
      .insert(transactionSources)
      .values({ transactionId, bankTransactionId })
      .onConflictDoNothing();
  }

  async linkTransactionSources(
    links: Array<{ transactionId: number; bankTransactionId: number }>,
  ): Promise<void> {
    if (links.length === 0) {
      return;
    }
    await this.db
      .insert(transactionSources)
      .values(links)
      .onConflictDoNothing();
  }
}
