/**
 * SpreadsheetBudgetMapper - Maps between Budget entity and spreadsheet records
 *
 * Handles conversion between domain Budget entity and spreadsheet row format,
 * including Money value object mapping to separate amount/currency fields.
 */

import { Budget } from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';

/**
 * Budget record type matching the spreadsheet schema.
 * This explicit interface ensures type safety when mapping to/from the spreadsheet.
 */
export interface BudgetRecord {
  /** Budget name (required) */
  name: string;
  /** Budget amount in minor units (required) */
  amount: number;
  /** Currency code (required) */
  currency: string;
  /** Start date for the budget period (optional) */
  startDate?: Date;
  /** End date for the budget period (optional) */
  endDate?: Date;
  /** Database ID (auto-incremented row number) */
  dbId?: number;
}

/**
 * Mapper for converting between Budget domain entity and spreadsheet records.
 */
export class SpreadsheetBudgetMapper {
  /**
   * Convert a domain Budget entity to a spreadsheet record.
   *
   * @param budget - The domain budget entity
   * @returns A record suitable for spreadsheet storage
   */
  toRecord(budget: Budget): BudgetRecord {
    return {
      name: budget.name,
      amount: budget.amount.amount,
      currency: budget.amount.currency.code,
      startDate: budget.startDate,
      endDate: budget.endDate,
      dbId: budget.dbId ?? undefined,
    };
  }

  /**
   * Convert a spreadsheet record to a domain Budget entity.
   *
   * @param record - The spreadsheet record
   * @returns A domain Budget entity
   */
  toEntity(record: BudgetRecord): Budget {
    const currency = Currency.fromCode(record.currency);
    const money = Money.create(record.amount, currency);

    return Budget.create({
      name: record.name,
      amount: money,
      startDate: record.startDate ?? new Date(0),
      endDate: record.endDate ?? new Date('2099-12-31'),
      dbId: record.dbId,
    });
  }
}
