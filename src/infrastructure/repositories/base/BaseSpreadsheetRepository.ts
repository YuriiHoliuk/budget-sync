/**
 * BaseSpreadsheetRepository - Generic base class for spreadsheet-backed repositories
 *
 * Handles spreadsheet-specific operations like row index tracking internally,
 * keeping domain layer clean from storage details.
 */

import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import { SpreadsheetTable } from '@modules/spreadsheet/SpreadsheetTable.ts';
import type {
  ColumnDefinition,
  SchemaToRecord,
} from '@modules/spreadsheet/types.ts';

/**
 * Abstract base repository for entities stored in Google Spreadsheets.
 *
 * This class encapsulates all spreadsheet-specific logic (row indices, schema validation)
 * so that concrete repositories only need to implement entity mapping.
 *
 * @template TEntity - The domain entity type
 * @template TSchema - The spreadsheet schema type (record of column definitions)
 * @template TRecord - The TypeScript record type for spreadsheet rows (defaults to SchemaToRecord<TSchema>)
 */
export abstract class BaseSpreadsheetRepository<
  TEntity,
  TSchema extends Record<string, ColumnDefinition>,
  TRecord = SchemaToRecord<TSchema>,
> {
  protected readonly table: SpreadsheetTable<TSchema>;

  constructor(
    client: SpreadsheetsClient,
    spreadsheetId: string,
    sheetName: string,
    schema: TSchema,
  ) {
    this.table = new SpreadsheetTable(client, spreadsheetId, sheetName, schema);
  }

  /**
   * Convert a spreadsheet record to a domain entity.
   * Must be implemented by subclasses.
   */
  protected abstract toEntity(record: TRecord): TEntity;

  /**
   * Convert a domain entity to a spreadsheet record.
   * Must be implemented by subclasses.
   */
  protected abstract toRecord(entity: TEntity): TRecord;

  /**
   * Find the first entity matching a predicate.
   * Row index tracking is internal - domain layer doesn't see it.
   */
  protected async findBy(
    predicate: (record: TRecord) => boolean,
  ): Promise<TEntity | null> {
    // Cast predicate to work with SchemaToRecord since TRecord is compatible
    const schemaRecordPredicate = predicate as (
      record: SchemaToRecord<TSchema>,
    ) => boolean;
    const result = await this.table.findRow(schemaRecordPredicate, {
      skipInvalidRows: true,
    });
    if (!result) {
      return null;
    }
    return this.toEntity(result.record as TRecord);
  }

  /**
   * Find all entities matching a predicate.
   */
  protected async findAllBy(
    predicate: (record: TRecord) => boolean,
  ): Promise<TEntity[]> {
    const schemaRecordPredicate = predicate as (
      record: SchemaToRecord<TSchema>,
    ) => boolean;
    const results = await this.table.findRows(schemaRecordPredicate, {
      skipInvalidRows: true,
    });
    return results.map((result) => this.toEntity(result.record as TRecord));
  }

  /**
   * Update an entity by finding it with a predicate.
   * Returns true if entity was found and updated, false otherwise.
   */
  protected async updateBy(
    predicate: (record: TRecord) => boolean,
    entity: TEntity,
  ): Promise<boolean> {
    const schemaRecordPredicate = predicate as (
      record: SchemaToRecord<TSchema>,
    ) => boolean;
    const result = await this.table.findRow(schemaRecordPredicate, {
      skipInvalidRows: true,
    });
    if (!result) {
      return false;
    }
    const record = this.toRecord(entity);
    await this.table.updateRowAt(
      result.rowIndex,
      record as SchemaToRecord<TSchema>,
    );
    return true;
  }

  /**
   * Delete an entity by finding it with a predicate.
   * Note: This clears the row content but doesn't remove the row from the sheet.
   * Returns true if entity was found and deleted, false otherwise.
   */
  protected async deleteBy(
    predicate: (record: TRecord) => boolean,
  ): Promise<boolean> {
    const schemaRecordPredicate = predicate as (
      record: SchemaToRecord<TSchema>,
    ) => boolean;
    const result = await this.table.findRow(schemaRecordPredicate, {
      skipInvalidRows: true,
    });
    if (!result) {
      return false;
    }
    // Create an empty record to clear the row
    const emptyRecord = this.createEmptyRecord();
    await this.table.updateRowAt(
      result.rowIndex,
      emptyRecord as SchemaToRecord<TSchema>,
    );
    return true;
  }

  /**
   * Find all entities in the spreadsheet.
   */
  async findAll(): Promise<TEntity[]> {
    const rows = await this.table.readRows({ skipInvalidRows: true });
    return rows.map((row) => this.toEntity(row as TRecord));
  }

  /**
   * Save a new entity to the spreadsheet (append).
   */
  async save(entity: TEntity): Promise<void> {
    const record = this.toRecord(entity);
    await this.table.appendRow(record as SchemaToRecord<TSchema>);
  }

  /**
   * Save multiple entities to the spreadsheet (append).
   */
  async saveMany(entities: TEntity[]): Promise<void> {
    const records = entities.map(
      (entity) => this.toRecord(entity) as SchemaToRecord<TSchema>,
    );
    await this.table.appendRows(records);
  }

  /**
   * Create an empty record for clearing rows.
   * Subclasses may override if needed.
   */
  protected createEmptyRecord(): TRecord {
    // Return an object with null values for all fields
    // The actual implementation depends on the schema structure
    return {} as TRecord;
  }
}
