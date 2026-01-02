/**
 * SpreadsheetAccountMapper - Maps between Account entity and spreadsheet records
 *
 * Handles conversion of account types between Monobank format and Ukrainian display names,
 * and converts between minor units (kopecks) and major units (hryvnias).
 */

import { Account } from '@domain/entities/Account.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';

/**
 * Account record type matching the spreadsheet schema.
 * This explicit interface ensures type safety when mapping to/from the spreadsheet.
 *
 * Required fields must have values; optional fields may be undefined.
 */
export interface AccountRecord {
  /** User-friendly account name (user-defined, preserved on updates) */
  name?: string;
  /** External account name from bank (e.g., "Black Card *4530 (USD)") */
  externalName?: string;
  /** Account type display name (e.g., "Дебетова", "Кредитка", "ФОП") */
  type: string;
  /** Currency code (e.g., "UAH", "USD") */
  currency: string;
  /** Balance in major units (hryvnias, not kopecks). For credit accounts, this is actual balance (balance - creditLimit). */
  balance: number;
  /** Credit limit in major units (hryvnias). 0 for non-credit accounts. */
  creditLimit: number;
  /** External ID from source system (optional) */
  externalId?: string;
  /** IBAN (optional) */
  iban?: string;
  /** Bank name (e.g., "monobank") */
  bank?: string;
  /** Last sync timestamp in Unix seconds */
  lastSyncTime?: number;
}

/**
 * Mapping from Monobank account types to spreadsheet display names
 */
const ACCOUNT_TYPE_TO_DISPLAY: Record<string, string> = {
  black: 'Дебетова',
  white: 'Дебетова',
  platinum: 'Дебетова',
  yellow: 'Дебетова',
  eAid: 'Дебетова',
  iron: 'Кредитка',
  fop: 'ФОП',
};

/**
 * Reverse mapping from spreadsheet display names to a canonical account type
 */
const DISPLAY_TO_ACCOUNT_TYPE: Record<string, string> = {
  Дебетова: 'black',
  Кредитка: 'iron',
  ФОП: 'fop',
};

/**
 * Mapper for converting between Account domain entity and spreadsheet records.
 */
export class SpreadsheetAccountMapper {
  /**
   * Convert a domain Account entity to a spreadsheet record.
   * Bank name goes to externalName, user name is preserved separately.
   * For credit accounts, balance is calculated as (balance - creditLimit) to show actual debt.
   *
   * @param account - The domain account entity
   * @param existingName - Existing user-defined name to preserve (optional)
   * @returns A record suitable for spreadsheet storage
   */
  toRecord(account: Account, existingName?: string): AccountRecord {
    const accountType = account.type ?? 'black';
    const displayType = ACCOUNT_TYPE_TO_DISPLAY[accountType] ?? 'Дебетова';
    const creditLimit = account.creditLimit?.toMajorUnits() ?? 0;

    return {
      name: existingName ?? account.name, // Preserve user name, fallback to bank name for new accounts
      externalName: account.name, // Bank name always goes here
      type: displayType,
      currency: account.currency.code,
      balance: account.actualBalance.toMajorUnits(), // For credit accounts: balance - creditLimit
      creditLimit,
      externalId: account.externalId,
      iban: account.iban,
      bank: account.bank,
      lastSyncTime: account.lastSyncTime,
    };
  }

  /**
   * Convert a spreadsheet record to a domain Account entity.
   *
   * Note: The spreadsheet stores "actual balance" (balance - creditLimit for credit accounts).
   * When reconstructing the domain entity, we reverse this: balance = actualBalance + creditLimit.
   *
   * @param record - The spreadsheet record
   * @returns A domain Account entity
   */
  toEntity(record: AccountRecord): Account {
    const currency = Currency.fromCode(record.currency);

    // Convert creditLimit from major units to minor units
    const creditLimitInMinorUnits = Math.round((record.creditLimit ?? 0) * 100);
    const creditLimit =
      creditLimitInMinorUnits > 0
        ? Money.create(creditLimitInMinorUnits, currency)
        : undefined;

    // Convert balance from major units (hryvnias) to minor units (kopecks)
    // Spreadsheet stores actual balance, so for credit accounts we need to reverse:
    // originalBalance = actualBalance + creditLimit
    const actualBalanceInMinorUnits = Math.round(record.balance * 100);
    const balanceInMinorUnits =
      actualBalanceInMinorUnits + creditLimitInMinorUnits;
    const balance = Money.create(balanceInMinorUnits, currency);

    // Map display type back to account type
    const accountType = DISPLAY_TO_ACCOUNT_TYPE[record.type] ?? 'black';

    // Use externalName (bank name) for domain entity, fall back to user name
    const accountName = record.externalName ?? record.name ?? '';

    // Generate ID from externalId if present, otherwise use name as fallback
    const accountId = record.externalId ?? accountName;

    return Account.create(
      {
        externalId: record.externalId ?? accountName,
        name: accountName,
        currency,
        balance,
        creditLimit,
        type: accountType,
        iban: record.iban,
        bank: record.bank,
        lastSyncTime: record.lastSyncTime,
      },
      accountId,
    );
  }
}
