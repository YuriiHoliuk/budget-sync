/**
 * Spreadsheet module types
 * Business-agnostic types for working with Google Spreadsheets
 */

/** Represents a single cell value in a spreadsheet */
export type CellValue = string | number | boolean | null;

/** A row of cell values */
export type Row = CellValue[];

/** Information about a single sheet within a spreadsheet */
export interface SheetInfo {
  id: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

/** Metadata about the spreadsheet */
export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
}

/** Options for reading values from a spreadsheet */
export interface ReadOptions {
  /** How values should be rendered: formatted (default), unformatted, or as formulas */
  valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';
  /** How dates should be rendered */
  dateTimeRenderOption?: 'SERIAL_NUMBER' | 'FORMATTED_STRING';
}

/** Options for writing values to a spreadsheet */
export interface WriteOptions {
  /** How input should be interpreted: RAW (literal) or USER_ENTERED (parsed) */
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}

/** Options for appending rows */
export interface AppendOptions extends WriteOptions {
  /** Whether to insert new rows or overwrite existing data */
  insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS';
}

/** Result of a write operation */
export interface WriteResult {
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

/** Result of an append operation */
export interface AppendResult {
  updatedRange: string;
  updatedRows: number;
  updatedCells: number;
}

/**
 * Schema column type - defines what type a column value should be
 */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date';

/**
 * Column definition in a table schema
 */
export interface ColumnDefinition {
  /** The header name expected in the spreadsheet */
  name: string;
  /** The type of values in this column */
  type: ColumnType;
  /** Whether this column is required (must have a header in spreadsheet) */
  required?: boolean;
}

/**
 * Table schema - defines the expected structure of a sheet when treated as a table
 * The schema maps property names to column definitions
 */
export type TableSchema<T extends Record<string, ColumnDefinition>> = T;

/**
 * Extracts the TypeScript type from a ColumnType
 */
export type ColumnTypeToTS<T extends ColumnType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'date'
        ? Date
        : never;

/**
 * Converts a TableSchema to a TypeScript record type
 * Required columns become required properties, optional columns become optional properties
 */
export type SchemaToRecord<T extends Record<string, ColumnDefinition>> = {
  [K in keyof T as T[K]['required'] extends false ? never : K]: ColumnTypeToTS<
    T[K]['type']
  >;
} & {
  [K in keyof T as T[K]['required'] extends false ? K : never]?: ColumnTypeToTS<
    T[K]['type']
  >;
};

/**
 * Validated schema info after checking headers
 */
export interface ValidatedSchema<T extends Record<string, ColumnDefinition>> {
  /** The original schema definition */
  schema: T;
  /** Map of schema property name to column index (0-based) */
  columnIndices: Record<keyof T, number>;
  /** The header row as found in the spreadsheet */
  headers: string[];
}
