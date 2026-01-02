/**
 * SpreadsheetTransactionRepository - Transaction repository backed by Google Spreadsheet
 *
 * Extends BaseSpreadsheetRepository for spreadsheet operations and implements
 * TransactionRepository interface from domain layer.
 */

import type { Transaction } from '@domain/entities/Transaction.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
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
    // accountId will be resolved later when needed
    return this.mapper.toEntity(record, '');
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
   * Delete a transaction from the spreadsheet by ID.
   * Note: This clears the row content but doesn't remove the row.
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deleteBy((record) => record.externalId === id);

    if (!deleted) {
      throw new Error(`Transaction not found for deletion: ${id}`);
    }
  }
}
