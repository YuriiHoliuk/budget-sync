/**
 * SpreadsheetAccountRepository - Account repository backed by Google Spreadsheet
 *
 * Extends BaseSpreadsheetRepository for spreadsheet operations and implements
 * AccountRepository interface from domain layer.
 */

import type { Account } from '@domain/entities/Account.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import type { SchemaToRecord } from '@modules/spreadsheet/types.ts';
import { inject, injectable } from 'tsyringe';
import {
  type AccountRecord,
  SpreadsheetAccountMapper,
} from '../mappers/SpreadsheetAccountMapper.ts';
import { BaseSpreadsheetRepository } from './base/BaseSpreadsheetRepository.ts';
import {
  ACCOUNTS_SHEET_NAME,
  type AccountSchema,
  accountSchema,
} from './schemas/accountSchema.ts';

/**
 * Injection token for SpreadsheetsClient.
 * Needed because SpreadsheetsClient is a module class without @injectable() decorator.
 */
export const SPREADSHEETS_CLIENT_TOKEN = Symbol('SpreadsheetsClient');

/**
 * Injection token for spreadsheet configuration.
 * Needed because SpreadsheetConfig is an interface (erased at runtime).
 */
export const SPREADSHEET_CONFIG_TOKEN = Symbol('SpreadsheetConfig');

/**
 * Configuration required for spreadsheet repositories
 */
export interface SpreadsheetConfig {
  spreadsheetId: string;
}

/**
 * Repository for Account entities stored in a Google Spreadsheet.
 *
 * Extends BaseSpreadsheetRepository for common spreadsheet operations
 * and implements AccountRepository interface from domain layer.
 */
@injectable()
export class SpreadsheetAccountRepository
  extends BaseSpreadsheetRepository<Account, AccountSchema, AccountRecord>
  implements AccountRepository
{
  private readonly mapper = new SpreadsheetAccountMapper();

  constructor(
    @inject(SPREADSHEETS_CLIENT_TOKEN) client: SpreadsheetsClient,
    @inject(SPREADSHEET_CONFIG_TOKEN) config: SpreadsheetConfig,
  ) {
    super(client, config.spreadsheetId, ACCOUNTS_SHEET_NAME, accountSchema);
  }

  protected toEntity(record: AccountRecord): Account {
    return this.mapper.toEntity(record);
  }

  protected toRecord(entity: Account): AccountRecord {
    return this.mapper.toRecord(entity);
  }

  /**
   * Find an account by its internal ID.
   * In this implementation, ID matches externalId or name.
   */
  findById(id: string): Promise<Account | null> {
    return this.findBy(
      (record) => record.externalId === id || record.name === id,
    );
  }

  /**
   * Find an account by its external ID (e.g., from Monobank).
   */
  findByExternalId(externalId: string): Promise<Account | null> {
    return this.findBy((record) => record.externalId === externalId);
  }

  /**
   * Find an account by its IBAN.
   */
  findByIban(iban: string): Promise<Account | null> {
    return this.findBy((record) => record.iban === iban);
  }

  /**
   * Find all accounts for a specific bank.
   */
  findByBank(bank: string): Promise<Account[]> {
    return this.findAllBy((record) => record.bank === bank);
  }

  /**
   * Update the last sync timestamp for an account.
   * Finds the account by externalId and updates only the lastSyncTime field.
   */
  async updateLastSyncTime(
    accountId: string,
    timestamp: number,
  ): Promise<void> {
    const predicate = (record: SchemaToRecord<AccountSchema>) =>
      record.externalId === accountId;

    const result = await this.table.findRow(predicate, {
      skipInvalidRows: true,
    });

    if (!result) {
      throw new Error(
        `Account not found for updating last sync time: ${accountId}`,
      );
    }

    const updatedRecord = {
      ...result.record,
      lastSyncTime: timestamp,
    };

    await this.table.updateRowAt(
      result.rowIndex,
      updatedRecord as SchemaToRecord<AccountSchema>,
    );
  }

  /**
   * Update an existing account in the spreadsheet.
   * Finds the account by externalId and updates its data.
   * Preserves user-defined name, only updates externalName with bank name.
   */
  async update(account: Account): Promise<void> {
    const predicate = (record: SchemaToRecord<AccountSchema>) =>
      record.externalId === account.externalId ||
      record.externalName === account.name;

    const result = await this.table.findRow(predicate, {
      skipInvalidRows: true,
    });

    if (!result) {
      throw new Error(
        `Account not found for update: ${account.externalId || account.name}`,
      );
    }

    // Get existing user-defined name from the found record
    const existingUserName =
      typeof result.record.name === 'string' ? result.record.name : undefined;

    // Create new record, preserving user name
    const newRecord = this.mapper.toRecord(account, existingUserName);

    await this.table.updateRowAt(
      result.rowIndex,
      newRecord as SchemaToRecord<AccountSchema>,
    );
  }

  /**
   * Delete an account from the spreadsheet by ID.
   * Note: This clears the row content but doesn't remove the row.
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deleteBy(
      (record) => record.externalId === id || record.name === id,
    );

    if (!deleted) {
      throw new Error(`Account not found for deletion: ${id}`);
    }
  }
}
