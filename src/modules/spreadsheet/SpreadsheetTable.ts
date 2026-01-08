/**
 * SpreadsheetTable - Treat a sheet as a database table with schema validation
 *
 * This class wraps a sheet and provides typed access to rows based on a schema.
 * The schema defines expected columns and their types.
 */

import { RowParseError, SchemaValidationError } from './errors.ts';
import type { SpreadsheetsClient } from './SpreadsheetsClient.ts';
import type {
  CellValue,
  ColumnDefinition,
  ColumnType,
  Row,
  SchemaToRecord,
  ValidatedSchema,
} from './types.ts';

/**
 * Options for SpreadsheetTable operations
 */
export interface SpreadsheetTableOptions {
  /** Whether to skip rows that fail parsing (default: false, throws error) */
  skipInvalidRows?: boolean;
}

/**
 * SpreadsheetTable provides table-like access to a sheet with schema validation.
 *
 * Usage:
 * 1. Define a schema with column definitions
 * 2. Create a SpreadsheetTable instance
 * 3. Call validateSchema() to verify headers match
 * 4. Use readRows() to get typed records
 *
 * The schema-to-sheet mapping (which sheet to use) should be defined in the
 * infrastructure layer (repository), not in this module.
 */
export class SpreadsheetTable<T extends Record<string, ColumnDefinition>> {
  private validatedSchema: ValidatedSchema<T> | null = null;

  constructor(
    private readonly client: SpreadsheetsClient,
    private readonly spreadsheetId: string,
    private readonly sheetName: string,
    private readonly schema: T,
  ) {}

  /**
   * Validate that the sheet headers match the schema
   * Must be called before reading rows
   *
   * @throws SchemaValidationError if required columns are missing
   */
  async validateSchema(): Promise<ValidatedSchema<T>> {
    const headers = await this.client.readHeaders(
      this.spreadsheetId,
      this.sheetName,
    );

    const missingColumns: string[] = [];
    const columnIndicesMap: Record<string, number> = {};

    const schemaEntries = this.getSchemaEntries();
    for (const { propertyName, column } of schemaEntries) {
      const headerIndex = headers.findIndex(
        (header) => header.toLowerCase() === column.name.toLowerCase(),
      );

      if (headerIndex === -1) {
        if (column.required !== false) {
          missingColumns.push(column.name);
        }
      } else {
        columnIndicesMap[propertyName] = headerIndex;
      }
    }

    if (missingColumns.length > 0) {
      throw new SchemaValidationError(missingColumns, headers);
    }

    // After validation, all required columns are present, so we can safely cast
    const columnIndices = columnIndicesMap as unknown as Record<
      keyof T,
      number
    >;

    this.validatedSchema = {
      schema: this.schema,
      columnIndices,
      headers,
    };

    return this.validatedSchema;
  }

  /**
   * Get the validated schema (must call validateSchema first)
   */
  getValidatedSchema(): ValidatedSchema<T> {
    if (!this.validatedSchema) {
      throw new Error('Schema not validated. Call validateSchema() first.');
    }
    return this.validatedSchema;
  }

  /**
   * Check if schema has been validated
   */
  isValidated(): boolean {
    return this.validatedSchema !== null;
  }

  /**
   * Read all data rows (excluding header) as typed records
   *
   * @param options - Options for reading
   * @returns Array of typed records
   */
  async readRows(
    options: SpreadsheetTableOptions = {},
  ): Promise<Array<SchemaToRecord<T>>> {
    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    const allRows = await this.client.readAllRows(
      this.spreadsheetId,
      this.sheetName,
    );

    // Skip header row
    const dataRows = allRows.slice(1);

    const results: Array<SchemaToRecord<T>> = [];

    for (let dataRowIndex = 0; dataRowIndex < dataRows.length; dataRowIndex++) {
      const row = dataRows[dataRowIndex];
      if (!row) {
        continue;
      }

      // +2 because spreadsheet is 1-indexed and we skip the header row
      const spreadsheetRowIndex = dataRowIndex + 2;

      try {
        const record = this.parseRow(row, spreadsheetRowIndex);
        results.push(record);
      } catch (error) {
        if (options.skipInvalidRows) {
          continue;
        }
        throw error;
      }
    }

    return results;
  }

  /**
   * Read a specific row by index (1-based, includes header as row 1)
   */
  async readRowAt(rowIndex: number): Promise<SchemaToRecord<T> | null> {
    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    if (rowIndex < 2) {
      throw new Error('Row index must be >= 2 (row 1 is the header)');
    }

    const row = await this.client.readRow(
      this.spreadsheetId,
      this.sheetName,
      rowIndex,
    );

    if (!row) {
      return null;
    }

    return this.parseRow(row, rowIndex);
  }

  /**
   * Append rows to the table
   *
   * Only writes to columns defined in the schema, leaving custom columns
   * untouched. This allows formulas and default values in custom columns
   * to work correctly for new rows.
   *
   * @param records - Array of records to append
   */
  async appendRows(records: Array<SchemaToRecord<T>>): Promise<void> {
    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    if (records.length === 0) {
      return;
    }

    const rowsCellUpdates = records.map((record) =>
      this.recordToCellUpdates(record),
    );
    await this.client.appendRowsCells(
      this.spreadsheetId,
      this.sheetName,
      rowsCellUpdates,
    );
  }

  /**
   * Append a single row to the table
   */
  async appendRow(record: SchemaToRecord<T>): Promise<void> {
    await this.appendRows([record]);
  }

  /**
   * Update a specific row (1-based index, row 1 is header)
   *
   * Only updates columns defined in the schema, preserving any custom
   * columns that exist in the spreadsheet but are not part of the schema.
   */
  async updateRowAt(
    rowIndex: number,
    record: SchemaToRecord<T>,
  ): Promise<void> {
    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    if (rowIndex < 2) {
      throw new Error('Row index must be >= 2 (row 1 is the header)');
    }

    const cellUpdates = this.recordToCellUpdates(record);
    await this.client.updateRowCells(
      this.spreadsheetId,
      this.sheetName,
      rowIndex,
      cellUpdates,
    );
  }

  /**
   * Update multiple rows at specific indices (batch update)
   *
   * Only updates columns defined in the schema, preserving any custom
   * columns that exist in the spreadsheet but are not part of the schema.
   *
   * @param rowUpdates - Array of objects with rowIndex and record to update
   */
  async updateRowsAt(
    rowUpdates: Array<{ rowIndex: number; record: SchemaToRecord<T> }>,
  ): Promise<void> {
    if (rowUpdates.length === 0) {
      return;
    }

    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    // Validate all row indices
    for (const update of rowUpdates) {
      if (update.rowIndex < 2) {
        throw new Error('Row index must be >= 2 (row 1 is the header)');
      }
    }

    const clientRowUpdates = rowUpdates.map((update) => ({
      rowIndex: update.rowIndex,
      cellUpdates: this.recordToCellUpdates(update.record),
    }));

    await this.client.updateRowsCells(
      this.spreadsheetId,
      this.sheetName,
      clientRowUpdates,
    );
  }

  /**
   * Convert a record to an array of cell updates for sparse writing
   */
  private recordToCellUpdates(
    record: SchemaToRecord<T>,
  ): Array<{ columnIndex: number; value: CellValue }> {
    const cellUpdates: Array<{ columnIndex: number; value: CellValue }> = [];

    const schemaEntries = this.getSchemaEntries();
    for (const { propertyName, column } of schemaEntries) {
      const columnIndex = this.getColumnIndex(propertyName);

      if (columnIndex === undefined) {
        continue;
      }

      const propertyValue = this.getRecordProperty(record, propertyName);
      cellUpdates.push({
        columnIndex,
        value: this.valueToCell(propertyValue, column.type),
      });
    }

    return cellUpdates;
  }

  /**
   * Find rows matching a predicate
   */
  async findRows(
    predicate: (record: SchemaToRecord<T>) => boolean,
    options: SpreadsheetTableOptions = {},
  ): Promise<Array<{ rowIndex: number; record: SchemaToRecord<T> }>> {
    if (!this.validatedSchema) {
      await this.validateSchema();
    }

    const allRows = await this.client.readAllRows(
      this.spreadsheetId,
      this.sheetName,
    );
    const dataRows = allRows.slice(1);

    return this.filterDataRows(dataRows, predicate, options);
  }

  private filterDataRows(
    dataRows: Row[],
    predicate: (record: SchemaToRecord<T>) => boolean,
    options: SpreadsheetTableOptions,
  ): Array<{ rowIndex: number; record: SchemaToRecord<T> }> {
    const results: Array<{ rowIndex: number; record: SchemaToRecord<T> }> = [];

    for (let dataRowIndex = 0; dataRowIndex < dataRows.length; dataRowIndex++) {
      const row = dataRows[dataRowIndex];
      if (!row) {
        continue;
      }

      const spreadsheetRowIndex = dataRowIndex + 2;
      const match = this.tryParseAndMatch(
        row,
        spreadsheetRowIndex,
        predicate,
        options.skipInvalidRows ?? false,
      );

      if (match) {
        results.push(match);
      }
    }

    return results;
  }

  private tryParseAndMatch(
    row: Row,
    rowIndex: number,
    predicate: (record: SchemaToRecord<T>) => boolean,
    skipInvalidRows: boolean,
  ): { rowIndex: number; record: SchemaToRecord<T> } | null {
    try {
      const record = this.parseRow(row, rowIndex);
      if (predicate(record)) {
        return { rowIndex, record };
      }
      return null;
    } catch (error) {
      if (!skipInvalidRows) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Find the first row matching a predicate
   */
  async findRow(
    predicate: (record: SchemaToRecord<T>) => boolean,
    options: SpreadsheetTableOptions = {},
  ): Promise<{ rowIndex: number; record: SchemaToRecord<T> } | null> {
    const results = await this.findRows(predicate, options);
    return results[0] ?? null;
  }

  /**
   * Get schema entries as an array for iteration
   */
  private getSchemaEntries(): Array<{
    propertyName: string;
    column: ColumnDefinition;
  }> {
    const entries: Array<{ propertyName: string; column: ColumnDefinition }> =
      [];
    for (const key of Object.keys(this.schema)) {
      const column = this.schema[key];
      if (column) {
        entries.push({ propertyName: key, column });
      }
    }
    return entries;
  }

  /**
   * Get column index by property name
   */
  private getColumnIndex(propertyName: string): number | undefined {
    const validatedSchema = this.getValidatedSchema();
    // TypeScript requires this cast because columnIndices is Record<keyof T, number>
    // but we're accessing it with a string key
    const indices = validatedSchema.columnIndices as Record<
      string,
      number | undefined
    >;
    return indices[propertyName];
  }

  /**
   * Get a property from a record safely
   */
  private getRecordProperty(
    record: SchemaToRecord<T>,
    propertyName: string,
  ): unknown {
    // SchemaToRecord<T> maps to an object with string keys at runtime
    const recordAsObject = record as unknown as Record<string, unknown>;
    return recordAsObject[propertyName];
  }

  /**
   * Parse a raw row into a typed record
   */
  private parseRow(row: Row, rowIndex: number): SchemaToRecord<T> {
    const record: Record<string, unknown> = {};

    const schemaEntries = this.getSchemaEntries();
    for (const { propertyName, column } of schemaEntries) {
      const columnIndex = this.getColumnIndex(propertyName);

      // If column not found in schema validation (optional column not present)
      if (columnIndex === undefined) {
        continue;
      }

      const cellValue = row[columnIndex] ?? null;
      record[propertyName] = this.parseValue(
        cellValue,
        column.type,
        rowIndex,
        column.name,
      );
    }

    // The record matches SchemaToRecord<T> structure after parsing all schema properties
    return record as SchemaToRecord<T>;
  }

  /**
   * Parse a cell value to the expected type
   */
  private parseValue(
    value: CellValue,
    type: ColumnType,
    rowIndex: number,
    columnName: string,
  ): unknown {
    if (value === null || value === '') {
      return null;
    }

    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return this.parseNumberValue(value, rowIndex, columnName);
      case 'boolean':
        return this.parseBooleanValue(value, rowIndex, columnName);
      case 'date':
        return this.parseDateValue(value, rowIndex, columnName);
      default:
        return value;
    }
  }

  private parseNumberValue(
    value: CellValue,
    rowIndex: number,
    columnName: string,
  ): number {
    if (typeof value === 'number') {
      return value;
    }
    // Handle locale-specific decimal separators (e.g., "1 234,56" -> 1234.56)
    const normalizedValue = String(value)
      .replace(/\s/g, '') // Remove thousand separators (spaces)
      .replace(',', '.'); // Convert comma decimal to period
    const parsedNumber = Number(normalizedValue);
    if (Number.isNaN(parsedNumber)) {
      throw new RowParseError(rowIndex, columnName, 'number', value);
    }
    return parsedNumber;
  }

  private parseBooleanValue(
    value: CellValue,
    rowIndex: number,
    columnName: string,
  ): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalizedValue = String(value).toLowerCase();
    const truthyValues = ['true', 'yes', '1'];
    const falsyValues = ['false', 'no', '0'];

    if (truthyValues.includes(normalizedValue)) {
      return true;
    }
    if (falsyValues.includes(normalizedValue)) {
      return false;
    }
    throw new RowParseError(rowIndex, columnName, 'boolean', value);
  }

  private parseDateValue(
    value: CellValue,
    rowIndex: number,
    columnName: string,
  ): Date {
    const parsedDate = new Date(String(value));
    if (Number.isNaN(parsedDate.getTime())) {
      throw new RowParseError(rowIndex, columnName, 'date', value);
    }
    return parsedDate;
  }

  /**
   * Convert a typed value to a cell value
   */
  private valueToCell(value: unknown, type: ColumnType): CellValue {
    if (value === null || value === undefined) {
      return null;
    }

    switch (type) {
      case 'string':
        return String(value);

      case 'number':
        return typeof value === 'number' ? value : Number(value);

      case 'boolean':
        return Boolean(value);

      case 'date':
        if (value instanceof Date) {
          return value.toISOString();
        }
        return String(value);

      default:
        return String(value);
    }
  }
}

/**
 * Factory function to create a SpreadsheetTable
 */
export function createSpreadsheetTable<
  T extends Record<string, ColumnDefinition>,
>(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string,
  schema: T,
): SpreadsheetTable<T> {
  return new SpreadsheetTable(client, spreadsheetId, sheetName, schema);
}
