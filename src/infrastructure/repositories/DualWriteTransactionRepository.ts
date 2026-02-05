import type { Transaction } from '@domain/entities/Transaction.ts';
import type {
  CategorizationUpdate,
  TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type {
  PaginationParams,
  TransactionFilterParams,
  TransactionRecord,
  TransactionSummary,
} from '@domain/repositories/transaction-types.ts';
import type { CategorizationStatus } from '@domain/value-objects/index.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { LOGGER_TOKEN } from '@modules/logging/Logger.ts';
import { inject, injectable } from 'tsyringe';
import { DATABASE_TRANSACTION_REPOSITORY_TOKEN } from './database/tokens.ts';
import { SPREADSHEET_TRANSACTION_REPOSITORY_TOKEN } from './spreadsheet/tokens.ts';

@injectable()
export class DualWriteTransactionRepository implements TransactionRepository {
  constructor(
    @inject(DATABASE_TRANSACTION_REPOSITORY_TOKEN)
    private readonly dbRepo: TransactionRepository,
    @inject(SPREADSHEET_TRANSACTION_REPOSITORY_TOKEN)
    private readonly spreadsheetRepo: TransactionRepository,
    @inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {}

  findById(id: string): Promise<Transaction | null> {
    return this.dbRepo.findById(id);
  }

  findAll(): Promise<Transaction[]> {
    return this.dbRepo.findAll();
  }

  findByExternalId(externalId: string): Promise<Transaction | null> {
    return this.dbRepo.findByExternalId(externalId);
  }

  findByExternalIds(externalIds: string[]): Promise<Map<string, Transaction>> {
    return this.dbRepo.findByExternalIds(externalIds);
  }

  findByAccountId(accountId: string): Promise<Transaction[]> {
    return this.dbRepo.findByAccountId(accountId);
  }

  findByCategorizationStatus(
    status: CategorizationStatus,
  ): Promise<Transaction[]> {
    return this.dbRepo.findByCategorizationStatus(status);
  }

  findUncategorized(): Promise<Transaction[]> {
    return this.dbRepo.findUncategorized();
  }

  async save(transaction: Transaction): Promise<void> {
    await this.dbRepo.save(transaction);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.save(transaction),
    );
  }

  async saveAndReturn(transaction: Transaction): Promise<Transaction> {
    const saved = await this.dbRepo.saveAndReturn(transaction);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.save(saved));
    return saved;
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    await this.dbRepo.saveMany(transactions);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.saveMany(transactions),
    );
  }

  async saveManyAndReturn(transactions: Transaction[]): Promise<Transaction[]> {
    const saved = await this.dbRepo.saveManyAndReturn(transactions);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.saveMany(saved));
    return saved;
  }

  async update(transaction: Transaction): Promise<void> {
    await this.dbRepo.update(transaction);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.update(transaction),
    );
  }

  async updateMany(transactions: Transaction[]): Promise<void> {
    await this.dbRepo.updateMany(transactions);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.updateMany(transactions),
    );
  }

  async updateCategorization(
    externalId: string,
    data: CategorizationUpdate,
  ): Promise<void> {
    await this.dbRepo.updateCategorization(externalId, data);
    await this.mirrorToSpreadsheet(() =>
      this.spreadsheetRepo.updateCategorization(externalId, data),
    );
  }

  async delete(id: string): Promise<void> {
    await this.dbRepo.delete(id);
    await this.mirrorToSpreadsheet(() => this.spreadsheetRepo.delete(id));
  }

  // Record-based methods (read-only, no dual-write needed)
  findRecordById(dbId: number): Promise<TransactionRecord | null> {
    return this.dbRepo.findRecordById(dbId);
  }

  findRecordsFiltered(
    filter: TransactionFilterParams,
    pagination: PaginationParams,
  ): Promise<TransactionRecord[]> {
    return this.dbRepo.findRecordsFiltered(filter, pagination);
  }

  countFiltered(filter: TransactionFilterParams): Promise<number> {
    return this.dbRepo.countFiltered(filter);
  }

  updateRecordCategory(
    dbId: number,
    categoryId: number | null,
  ): Promise<TransactionRecord | null> {
    // Updates only affect DB, no spreadsheet mirror for category updates by DB ID
    return this.dbRepo.updateRecordCategory(dbId, categoryId);
  }

  updateRecordBudget(
    dbId: number,
    budgetId: number | null,
  ): Promise<TransactionRecord | null> {
    // Updates only affect DB, no spreadsheet mirror for budget updates by DB ID
    return this.dbRepo.updateRecordBudget(dbId, budgetId);
  }

  updateRecordStatus(
    dbId: number,
    status: CategorizationStatus,
  ): Promise<TransactionRecord | null> {
    // Updates only affect DB, no spreadsheet mirror for status updates by DB ID
    return this.dbRepo.updateRecordStatus(dbId, status);
  }

  findTransactionSummaries(): Promise<TransactionSummary[]> {
    return this.dbRepo.findTransactionSummaries();
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
