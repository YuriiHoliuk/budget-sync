import { Account } from '@domain/entities/Account.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { Money } from '@domain/value-objects/Money.ts';
import type { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import { accounts } from '@modules/database/schema/index.ts';
import { and, eq, ilike } from 'drizzle-orm';
import { inject, injectable } from 'tsyringe';
import { DatabaseAccountMapper } from '../../mappers/DatabaseAccountMapper.ts';
import { DATABASE_CLIENT_TOKEN } from './tokens.ts';

@injectable()
export class DatabaseAccountRepository implements AccountRepository {
  private readonly mapper = new DatabaseAccountMapper();

  constructor(
    @inject(DATABASE_CLIENT_TOKEN) private readonly client: DatabaseClient,
  ) {}

  private get db() {
    return this.client.db;
  }

  findById(id: string): Promise<Account | null> {
    return this.findByExternalId(id);
  }

  async findByDbId(dbId: number): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, dbId))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findAll(): Promise<Account[]> {
    const rows = await this.db.select().from(accounts);
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findActive(): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.isArchived, false));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async findByExternalId(externalId: string): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.externalId, externalId))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByName(name: string): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(and(ilike(accounts.name, name), eq(accounts.isArchived, false)))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByIban(iban: string): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.iban, iban))
      .limit(1);
    const row = rows[0];
    return row ? this.mapper.toEntity(row) : null;
  }

  async findByBank(bank: string): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.bank, bank));
    return rows.map((row) => this.mapper.toEntity(row));
  }

  async save(account: Account): Promise<void> {
    const insertData = this.mapper.toInsert(account);
    await this.db.insert(accounts).values(insertData);
  }

  async saveAndReturn(account: Account): Promise<Account> {
    const insertData = this.mapper.toInsert(account);
    const rows = await this.db.insert(accounts).values(insertData).returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert account');
    }
    return this.mapper.toEntity(row);
  }

  async update(account: Account): Promise<void> {
    const existingRow = await this.db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.externalId, account.externalId))
      .limit(1);
    const existingName = existingRow[0]?.name ?? undefined;
    const insertData = this.mapper.toInsert(account, existingName ?? undefined);
    await this.db
      .update(accounts)
      .set(insertData)
      .where(eq(accounts.externalId, account.externalId));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(accounts).where(eq(accounts.externalId, id));
  }

  async updateLastSyncTime(
    accountId: string,
    timestamp: number,
  ): Promise<void> {
    // timestamp is already in milliseconds (from Date.getTime())
    const result = await this.db
      .update(accounts)
      .set({ lastSyncTime: new Date(timestamp) })
      .where(eq(accounts.externalId, accountId))
      .returning({ id: accounts.id });
    if (result.length === 0) {
      throw new AccountNotFoundError(accountId);
    }
  }

  async updateBalance(externalId: string, newBalance: Money): Promise<void> {
    const result = await this.db
      .update(accounts)
      .set({ balance: newBalance.amount })
      .where(eq(accounts.externalId, externalId))
      .returning({ id: accounts.id });
    if (result.length === 0) {
      throw new AccountNotFoundError(externalId);
    }
  }
}
