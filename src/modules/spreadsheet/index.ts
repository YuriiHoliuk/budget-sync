/**
 * Spreadsheet Module
 *
 * Provides business-agnostic utilities for working with Google Spreadsheets.
 *
 * Two levels of abstraction:
 * 1. SpreadsheetsClient - Low-level operations (read/write cells, rows, ranges)
 * 2. SpreadsheetTable - Table-like access with schema validation
 *
 * Usage example:
 *
 * ```typescript
 * import {
 *   SpreadsheetsClient,
 *   SpreadsheetTable,
 *   type ColumnDefinition,
 * } from '@modules/spreadsheet';
 *
 * // Low-level client for basic operations
 * const client = new SpreadsheetsClient({
 *   serviceAccountFile: 'service-account.json',
 * });
 *
 * // Read metadata
 * const metadata = await client.getMetadata(spreadsheetId);
 *
 * // Read/write ranges
 * const rows = await client.readRange(spreadsheetId, 'Sheet1!A1:D10');
 * await client.appendRows(spreadsheetId, 'Sheet1', [['value1', 'value2']]);
 *
 * // Table-like access with schema
 * const schema = {
 *   id: { name: 'ID', type: 'string', required: true },
 *   amount: { name: 'Amount', type: 'number', required: true },
 *   date: { name: 'Date', type: 'date', required: true },
 * } as const satisfies Record<string, ColumnDefinition>;
 *
 * const table = new SpreadsheetTable(client, spreadsheetId, 'Transactions', schema);
 * await table.validateSchema(); // Validates headers match schema
 *
 * const records = await table.readRows(); // Returns typed records
 * await table.appendRow({ id: '123', amount: 100, date: new Date() });
 * ```
 */

// Errors
export {
  RateLimitError,
  RowParseError,
  SchemaValidationError,
  SheetNotFoundError,
  SpreadsheetApiError,
  SpreadsheetError,
} from './errors.ts';
// Client
export {
  type CellUpdate,
  SpreadsheetsClient,
  type SpreadsheetsClientConfig,
} from './SpreadsheetsClient.ts';
// Table
export {
  createSpreadsheetTable,
  SpreadsheetTable,
  type SpreadsheetTableOptions,
} from './SpreadsheetTable.ts';
// Types
export type {
  AppendOptions,
  AppendResult,
  CellValue,
  ColumnDefinition,
  ColumnType,
  ReadOptions,
  Row,
  SchemaToRecord,
  SheetInfo,
  SpreadsheetMetadata,
  TableSchema,
  ValidatedSchema,
  WriteOptions,
  WriteResult,
} from './types.ts';
// Utils
export { columnIndexToLetter, letterToColumnIndex } from './utils.ts';
