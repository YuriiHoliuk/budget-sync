/**
 * SpreadsheetTransactionRepository - Transaction repository backed by Google Spreadsheet
 *
 * Extends BaseSpreadsheetRepository for spreadsheet operations and implements
 * TransactionRepository interface from domain layer.
 */

import type { Transaction } from '@domain/entities/Transaction.ts';
import type {
  CategorizationUpdate,
  TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type {
  TransactionRecord as DomainTransactionRecord,
  PaginationParams,
  TransactionFilterParams,
  TransactionSummary,
} from '@domain/repositories/transaction-types.ts';
import type { CategorizationStatus } from '@domain/value-objects/index.ts';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import type { SchemaToRecord } from '@modules/spreadsheet/types.ts';
import { inject, injectable } from 'tsyringe';
import {
  SpreadsheetTransactionMapper,
  type TransactionRecord,
} from '../mappers/SpreadsheetTransactionMapper.ts';
import { BaseSpreadsheetRepository } from './base/BaseSpreadsheetRepository.ts';
import {
  SPREADSHEET_CONFIG_TOKEN,
  SPREADSHEETS_CLIENT_TOKEN,
  type SpreadsheetConfig,
} from './SpreadsheetAccountRepository.ts';
import {
  TRANSACTIONS_SHEET_NAME,
  type TransactionSchema,
  transactionSchema,
} from './schemas/transactionSchema.ts';

/**
 * Interface for resolving account names from account IDs.
 * This allows the transaction repository to display human-readable account names
 * without depending directly on the AccountRepository.
 */
export interface AccountNameResolver {
  getAccountName(accountId: string): Promise<string>;
}

/**
 * Injection token for AccountNameResolver.
 * Use with @inject(ACCOUNT_NAME_RESOLVER_TOKEN) in classes that depend on AccountNameResolver.
 */
export const ACCOUNT_NAME_RESOLVER_TOKEN = Symbol('AccountNameResolver');

/**
 * Repository for Transaction entities stored in a Google Spreadsheet.
 *
 * Extends BaseSpreadsheetRepository for common spreadsheet operations
 * and implements TransactionRepository interface from domain layer.
 */
@injectable()
export class SpreadsheetTransactionRepository
  extends BaseSpreadsheetRepository<
    Transaction,
    TransactionSchema,
    TransactionRecord
  >
  implements TransactionRepository
{
  private readonly mapper = new SpreadsheetTransactionMapper();

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
    @inject(ACCOUNT_NAME_RESOLVER_TOKEN)
    private readonly accountNameResolver: AccountNameResolver,
  ) {
    super(
      client,
      config.spreadsheetId,
      TRANSACTIONS_SHEET_NAME,
      transactionSchema,
    );
  }

  protected toEntity(record: TransactionRecord): Transaction {
    return this.mapper.toEntity(record, record.accountExternalId ?? '');
  }

  protected toRecord(entity: Transaction): TransactionRecord {
    // Account name will be replaced with real name before saving
    return this.mapper.toRecord(entity, '');
  }

  /**
   * Find a transaction by its internal ID.
   * Delegates to findByExternalId since ID matches externalId.
   */
  findById(id: string): Promise<Transaction | null> {
    return this.findByExternalId(id);
  }

  /**
   * Find a transaction by its external ID (e.g., from Monobank).
   */
  findByExternalId(externalId: string): Promise<Transaction | null> {
    return this.findBy((record) => record.externalId === externalId);
  }

  /**
   * Find multiple transactions by their external IDs.
   * Returns a Map from externalId to Transaction for efficient lookup.
   */
  async findByExternalIds(
    externalIds: string[],
  ): Promise<Map<string, Transaction>> {
    const externalIdSet = new Set(externalIds);
    const transactions = await this.findAllBy(
      (record) =>
        record.externalId !== undefined && externalIdSet.has(record.externalId),
    );

    const resultMap = new Map<string, Transaction>();
    for (const transaction of transactions) {
      resultMap.set(transaction.externalId, transaction);
    }
    return resultMap;
  }

  /**
   * Find all transactions for a specific account.
   * Note: This searches by account name in the spreadsheet, not account ID.
   */
  findByAccountId(accountId: string): Promise<Transaction[]> {
    return this.findAllBy((record) => record.account === accountId);
  }

  /**
   * Save a new transaction to the spreadsheet.
   * Resolves account name before appending.
   */
  override async save(transaction: Transaction): Promise<void> {
    const accountName = await this.accountNameResolver.getAccountName(
      transaction.accountId,
    );
    const record = this.mapper.toRecord(transaction, accountName);
    await this.table.appendRow(record as SchemaToRecord<TransactionSchema>);
  }

  /**
   * Save multiple transactions to the spreadsheet.
   * Resolves all account names before appending.
   */
  override async saveMany(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    // Collect unique account IDs
    const accountIds = [...new Set(transactions.map((tx) => tx.accountId))];

    // Resolve all account names in parallel
    const accountNameMap = new Map<string, string>();
    await Promise.all(
      accountIds.map(async (accountId) => {
        const name = await this.accountNameResolver.getAccountName(accountId);
        accountNameMap.set(accountId, name);
      }),
    );

    // Convert transactions to records with resolved account names
    const records = transactions.map((transaction) => {
      const accountName = accountNameMap.get(transaction.accountId) ?? '';
      return this.mapper.toRecord(
        transaction,
        accountName,
      ) as SchemaToRecord<TransactionSchema>;
    });

    await this.table.appendRows(records);
  }

  /**
   * Save a transaction and return it.
   * Spreadsheet doesn't generate IDs, so we just save and return the same transaction.
   */
  async saveAndReturn(transaction: Transaction): Promise<Transaction> {
    await this.save(transaction);
    return transaction;
  }

  /**
   * Save multiple transactions and return them.
   * Spreadsheet doesn't generate IDs, so we just save and return the same transactions.
   */
  async saveManyAndReturn(transactions: Transaction[]): Promise<Transaction[]> {
    await this.saveMany(transactions);
    return transactions;
  }

  /**
   * Update an existing transaction in the spreadsheet.
   * Finds the transaction by externalId and updates its data.
   */
  async update(transaction: Transaction): Promise<void> {
    const predicate = (record: SchemaToRecord<TransactionSchema>) =>
      record.externalId === transaction.externalId;

    const result = await this.table.findRow(predicate, {
      skipInvalidRows: true,
    });

    if (!result) {
      throw new Error(
        `Transaction not found for update: ${transaction.externalId}`,
      );
    }

    const accountName = await this.accountNameResolver.getAccountName(
      transaction.accountId,
    );
    const newRecord = this.mapper.toRecord(transaction, accountName);

    await this.table.updateRowAt(
      result.rowIndex,
      newRecord as SchemaToRecord<TransactionSchema>,
    );
  }

  /**
   * Update multiple transactions in the spreadsheet.
   * Finds each transaction by externalId and updates its data in a batch.
   */
  async updateMany(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    // Find all matching rows in a single read
    const externalIdSet = new Set(transactions.map((tx) => tx.externalId));
    const foundRows = await this.table.findRows(
      (record) =>
        record.externalId !== undefined &&
        externalIdSet.has(String(record.externalId)),
      { skipInvalidRows: true },
    );

    // Create a map from externalId to rowIndex
    const rowIndexMap = new Map<string, number>();
    for (const row of foundRows) {
      if (row.record.externalId !== undefined) {
        rowIndexMap.set(String(row.record.externalId), row.rowIndex);
      }
    }

    // Resolve all account names
    const accountNameMap = await this.resolveAccountNames(transactions);

    // Build row updates for batch operation
    const rowUpdates = this.buildRowUpdates(
      transactions,
      rowIndexMap,
      accountNameMap,
    );

    if (rowUpdates.length > 0) {
      await this.table.updateRowsAt(rowUpdates);
    }
  }

  /**
   * Resolve account names for all transactions.
   */
  private async resolveAccountNames(
    transactions: Transaction[],
  ): Promise<Map<string, string>> {
    const accountIds = [...new Set(transactions.map((tx) => tx.accountId))];
    const accountNameMap = new Map<string, string>();

    await Promise.all(
      accountIds.map(async (accountId) => {
        const name = await this.accountNameResolver.getAccountName(accountId);
        accountNameMap.set(accountId, name);
      }),
    );

    return accountNameMap;
  }

  /**
   * Build row updates for batch update operation.
   */
  private buildRowUpdates(
    transactions: Transaction[],
    rowIndexMap: Map<string, number>,
    accountNameMap: Map<string, string>,
  ): Array<{ rowIndex: number; record: SchemaToRecord<TransactionSchema> }> {
    const rowUpdates: Array<{
      rowIndex: number;
      record: SchemaToRecord<TransactionSchema>;
    }> = [];

    for (const transaction of transactions) {
      const rowIndex = rowIndexMap.get(transaction.externalId);
      if (rowIndex === undefined) {
        // Skip transactions not found in spreadsheet (shouldn't happen normally)
        continue;
      }

      const accountName = accountNameMap.get(transaction.accountId) ?? '';
      const record = this.mapper.toRecord(
        transaction,
        accountName,
      ) as SchemaToRecord<TransactionSchema>;

      rowUpdates.push({ rowIndex, record });
    }

    return rowUpdates;
  }

  /**
   * Delete a transaction from the spreadsheet by ID.
   * Note: This clears the row content but doesn't remove the row.
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deleteBy((record) => record.externalId === id);

    if (!deleted) {
      throw new Error(`Transaction not found for deletion: ${id}`);
    }
  }

  /**
   * Find all transactions with a specific categorization status.
   */
  findByCategorizationStatus(
    status: CategorizationStatus,
  ): Promise<Transaction[]> {
    return this.findAllBy(
      (record) =>
        record.status === status || (status === 'pending' && !record.status),
    );
  }

  /**
   * Find all transactions without category and budget assigned.
   */
  findUncategorized(): Promise<Transaction[]> {
    return this.findAllBy((record) => !record.category && !record.budget);
  }

  /**
   * Update categorization fields for a transaction.
   * Finds the transaction by externalId and updates only categorization-related fields.
   */
  async updateCategorization(
    externalId: string,
    data: CategorizationUpdate,
  ): Promise<void> {
    const predicate = (record: SchemaToRecord<TransactionSchema>) =>
      record.externalId === externalId;

    const result = await this.table.findRow(predicate, {
      skipInvalidRows: true,
    });

    if (!result) {
      throw new Error(
        `Transaction not found for categorization update: ${externalId}`,
      );
    }

    const categorizationRecord = this.mapper.categorizationToRecord(data);
    const updatedRecord = {
      ...result.record,
      ...categorizationRecord,
    };

    await this.table.updateRowAt(result.rowIndex, updatedRecord);
  }

  // Record-based methods - not supported by spreadsheet repository
  // These are DB-specific operations that use database IDs and filtering
  findRecordById(_dbId: number): Promise<DomainTransactionRecord | null> {
    throw new Error(
      'findRecordById is not supported by SpreadsheetTransactionRepository',
    );
  }

  findRecordsFiltered(
    _filter: TransactionFilterParams,
    _pagination: PaginationParams,
  ): Promise<DomainTransactionRecord[]> {
    throw new Error(
      'findRecordsFiltered is not supported by SpreadsheetTransactionRepository',
    );
  }

  countFiltered(_filter: TransactionFilterParams): Promise<number> {
    throw new Error(
      'countFiltered is not supported by SpreadsheetTransactionRepository',
    );
  }

  updateRecordCategory(
    _dbId: number,
    _categoryId: number | null,
  ): Promise<DomainTransactionRecord | null> {
    throw new Error(
      'updateRecordCategory is not supported by SpreadsheetTransactionRepository',
    );
  }

  updateRecordBudget(
    _dbId: number,
    _budgetId: number | null,
  ): Promise<DomainTransactionRecord | null> {
    throw new Error(
      'updateRecordBudget is not supported by SpreadsheetTransactionRepository',
    );
  }

  updateRecordStatus(
    _dbId: number,
    _status: CategorizationStatus,
  ): Promise<DomainTransactionRecord | null> {
    throw new Error(
      'updateRecordStatus is not supported by SpreadsheetTransactionRepository',
    );
  }

  findTransactionSummaries(): Promise<TransactionSummary[]> {
    throw new Error(
      'findTransactionSummaries is not supported by SpreadsheetTransactionRepository',
    );
  }
}
