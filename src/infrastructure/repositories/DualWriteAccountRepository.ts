import type { Account } from '@domain/entities/Account.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { Money } from '@domain/value-objects/Money.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { LOGGER_TOKEN } from '@modules/logging/Logger.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_ACCOUNT_REPOSITORY_TOKEN } from './database/tokens.ts';
import { SPREADSHEET_ACCOUNT_REPOSITORY_TOKEN } from './spreadsheet/tokens.ts';

@injectable()
export class DualWriteAccountRepository implements AccountRepository {
  constructor(
    @inject(DATABASE_ACCOUNT_REPOSITORY_TOKEN)
    private readonly dbRepo: AccountRepository,
    @inject(SPREADSHEET_ACCOUNT_REPOSITORY_TOKEN)
    private readonly spreadsheetRepo: AccountRepository,
    @inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  findById(id: string): Promise<Account | null> {
    return this.dbRepo.findById(id);
  }

  findByDbId(dbId: number): Promise<Account | null> {
    return this.dbRepo.findByDbId(dbId);
  }

  findAll(): Promise<Account[]> {
    return this.dbRepo.findAll();
  }

  findActive(): Promise<Account[]> {
    return this.dbRepo.findActive();
  }

  findByExternalId(externalId: string): Promise<Account | null> {
    return this.dbRepo.findByExternalId(externalId);
  }

  findByName(name: string): Promise<Account | null> {
    return this.dbRepo.findByName(name);
  }

  findByIban(iban: string): Promise<Account | null> {
    return this.dbRepo.findByIban(iban);
  }

  findByBank(bank: string): Promise<Account[]> {
    return this.dbRepo.findByBank(bank);
  }

  async save(account: Account): Promise<void> {
    await this.dbRepo.save(account);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(account));
  }

  async saveAndReturn(account: Account): Promise<Account> {
    const saved = await this.dbRepo.saveAndReturn(account);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(saved));
    return saved;
  }

  async update(account: Account): Promise<void> {
    await this.dbRepo.update(account);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.update(account));
  }

  async delete(id: string): Promise<void> {
    await this.dbRepo.delete(id);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.delete(id));
  }

  async updateLastSyncTime(
    accountId: string,
    timestamp: number,
  ): Promise<void> {
    await this.dbRepo.updateLastSyncTime(accountId, timestamp);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.updateLastSyncTime(accountId, timestamp),
    );
  }

  async updateBalance(externalId: string, newBalance: Money): Promise<void> {
    await this.dbRepo.updateBalance(externalId, newBalance);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.updateBalance(externalId, newBalance),
    );
  }

  private async mirrorToSpreadsheet(
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.logger.warn('Spreadsheet mirror write failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
