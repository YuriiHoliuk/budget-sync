/**
 * SpreadsheetCategoryMapper - Maps between Category entity and spreadsheet records
 *
 * Handles conversion between domain Category entity and spreadsheet row format,
 * including status mapping between domain value object and spreadsheet strings.
 */

import { Category } from '@domain/entities/Category.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';

/**
 * Category record type matching the spreadsheet schema.
 * This explicit interface ensures type safety when mapping to/from the spreadsheet.
 */
export interface CategoryRecord {
  /** Category name (required) */
  name: string;
  /** Parent category name for hierarchy (optional) */
  parent?: string;
  /** Status: "active", "suggested", or "archived" (optional, defaults to "active") */
  status?: string;
  /** Database ID (auto-incremented row number) */
  dbId?: number;
}

/**
 * Mapping from spreadsheet status strings to domain CategoryStatus values.
 * Case-insensitive matching is handled in toEntity.
 */
const STATUS_TO_DOMAIN: Record<string, CategoryStatus> = {
  active: CategoryStatus.ACTIVE,
  suggested: CategoryStatus.SUGGESTED,
  archived: CategoryStatus.ARCHIVED,
};

/**
 * Mapper for converting between Category domain entity and spreadsheet records.
 */
export class SpreadsheetCategoryMapper {
  /**
   * Convert a domain Category entity to a spreadsheet record.
   *
   * @param category - The domain category entity
   * @returns A record suitable for spreadsheet storage
   */
  toRecord(category: Category): CategoryRecord {
    return {
      name: category.name,
      parent: category.parent,
      status: category.status,
      dbId: category.dbId ?? undefined,
    };
  }

  /**
   * Convert a spreadsheet record to a domain Category entity.
   *
   * @param record - The spreadsheet record
   * @returns A domain Category entity
   */
  toEntity(record: CategoryRecord): Category {
    const status = this.parseStatus(record.status);

    return Category.create({
      name: record.name,
      parent: record.parent,
      status,
      dbId: record.dbId,
    });
  }

  /**
   * Parse status string from spreadsheet to domain CategoryStatus.
   * Defaults to ACTIVE if status is missing or unrecognized.
   */
  private parseStatus(statusString: string | undefined): CategoryStatus {
    if (!statusString) {
      return CategoryStatus.ACTIVE;
    }

    const normalizedStatus = statusString.toLowerCase().trim();
    return STATUS_TO_DOMAIN[normalizedStatus] ?? CategoryStatus.ACTIVE;
  }
}
