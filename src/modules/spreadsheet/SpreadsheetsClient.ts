/**
 * SpreadsheetsClient - Low-level client for Google Sheets API
 *
 * Provides basic operations for reading/writing spreadsheet data.
 * This is a business-agnostic wrapper around the Google Sheets API.
 */

import { google, type sheets_v4 } from 'googleapis';
import {
  RateLimitError,
  SheetNotFoundError,
  SpreadsheetApiError,
} from './errors.ts';
import type {
  AppendOptions,
  AppendResult,
  CellValue,
  ReadOptions,
  Row,
  SheetInfo,
  SpreadsheetMetadata,
  WriteOptions,
  WriteResult,
} from './types.ts';
import { columnIndexToLetter } from './utils.ts';

/**
 * Represents a cell update with column index and value
 */
export interface CellUpdate {
  /** 0-based column index */
  columnIndex: number;
  /** Value to write */
  value: CellValue;
}

type SheetsApi = sheets_v4.Sheets;

export interface SpreadsheetsClientConfig {
  /**
   * Path to Google service account JSON file.
   * If not provided, uses Application Default Credentials (ADC).
   * ADC works automatically on Google Cloud (Cloud Run, GCE, etc.).
   */
  serviceAccountFile?: string;
}

export class SpreadsheetsClient {
  private sheets: SheetsApi | null = null;
  private readonly serviceAccountFile?: string;

  constructor(config: SpreadsheetsClientConfig = {}) {
    this.serviceAccountFile = config.serviceAccountFile;
  }

  /**
   * Initialize the Google Sheets API client (lazy initialization)
   *
   * Uses explicit service account file if provided, otherwise falls back
   * to Application Default Credentials (ADC) for cloud environments.
   */
  private getClient(): SheetsApi {
    if (this.sheets) {
      return this.sheets;
    }

    const authOptions: { keyFile?: string; scopes: string[] } = {
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    };

    if (this.serviceAccountFile) {
      authOptions.keyFile = this.serviceAccountFile;
    }

    const auth = new google.auth.GoogleAuth(authOptions);
    this.sheets = google.sheets({ version: 'v4', auth });

    return this.sheets;
  }

  /**
   * Wraps API calls with error handling
   */
  private async withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const errorCode = this.extractErrorCode(error);
        if (errorCode === 429) {
          throw new RateLimitError();
        }
        throw new SpreadsheetApiError(error.message, errorCode);
      }
      throw new SpreadsheetApiError(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Extract error code from an error object
   */
  private extractErrorCode(error: Error & { code?: unknown }): number {
    const code = error.code;
    return typeof code === 'number' ? code : 0;
  }

  /**
   * Convert API response values to Row array
   * Google Sheets API returns any[][], we convert to CellValue[][]
   */
  private toRows(values: unknown[][] | null | undefined): Row[] {
    if (!values) {
      return [];
    }
    return values.map((row) => row.map((cell) => this.toCellValue(cell)));
  }

  /**
   * Convert unknown value to CellValue
   */
  private toCellValue(value: unknown): CellValue {
    if (value === null || value === undefined) {
      return null;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    return String(value);
  }

  /**
   * Get spreadsheet metadata including list of sheets
   */
  async getMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
    const client = await this.getClient();

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.get({
        spreadsheetId,
      });

      const data = response.data;

      return {
        spreadsheetId: data.spreadsheetId ?? spreadsheetId,
        title: data.properties?.title ?? '',
        sheets: (data.sheets ?? []).map(
          (sheet): SheetInfo => ({
            id: sheet.properties?.sheetId ?? 0,
            title: sheet.properties?.title ?? '',
            rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
            columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
          }),
        ),
      };
    });
  }

  /**
   * Get information about a specific sheet by name
   */
  async getSheetInfo(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<SheetInfo> {
    const metadata = await this.getMetadata(spreadsheetId);
    const sheet = metadata.sheets.find(
      (sheetInfo) => sheetInfo.title === sheetName,
    );

    if (!sheet) {
      throw new SheetNotFoundError(sheetName);
    }

    return sheet;
  }

  /**
   * Read a range of cells from a spreadsheet
   *
   * @param spreadsheetId - The spreadsheet ID
   * @param range - A1 notation range (e.g., "Sheet1!A1:D10" or "A1:D10")
   * @param options - Read options
   * @returns 2D array of cell values
   */
  async readRange(
    spreadsheetId: string,
    range: string,
    options: ReadOptions = {},
  ): Promise<Row[]> {
    const client = await this.getClient();

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: options.valueRenderOption ?? 'FORMATTED_VALUE',
        dateTimeRenderOption:
          options.dateTimeRenderOption ?? 'FORMATTED_STRING',
      });

      return this.toRows(response.data.values);
    });
  }

  /**
   * Read multiple ranges in a single request
   */
  async readRanges(
    spreadsheetId: string,
    ranges: string[],
    options: ReadOptions = {},
  ): Promise<Map<string, Row[]>> {
    const client = await this.getClient();

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: options.valueRenderOption ?? 'FORMATTED_VALUE',
        dateTimeRenderOption:
          options.dateTimeRenderOption ?? 'FORMATTED_STRING',
      });

      const result = new Map<string, Row[]>();
      for (const valueRange of response.data.valueRanges ?? []) {
        if (valueRange.range) {
          result.set(valueRange.range, this.toRows(valueRange.values));
        }
      }

      return result;
    });
  }

  /**
   * Read a single row by index (1-based, as in spreadsheet)
   */
  async readRow(
    spreadsheetId: string,
    sheetName: string,
    rowIndex: number,
  ): Promise<Row | null> {
    const range = `'${sheetName}'!${rowIndex}:${rowIndex}`;
    const rows = await this.readRange(spreadsheetId, range);
    return rows[0] ?? null;
  }

  /**
   * Read the first row (header row) of a sheet
   */
  async readHeaders(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<string[]> {
    const row = await this.readRow(spreadsheetId, sheetName, 1);
    if (!row) {
      return [];
    }
    return row.map((cell) => (cell !== null ? String(cell) : ''));
  }

  /**
   * Read all rows from a sheet (including header)
   */
  readAllRows(
    spreadsheetId: string,
    sheetName: string,
    options: ReadOptions = {},
  ): Promise<Row[]> {
    const range = `'${sheetName}'`;

    return this.readRange(spreadsheetId, range, options);
  }

  /**
   * Read a single cell value
   */
  async readCell(
    spreadsheetId: string,
    sheetName: string,
    cell: string,
  ): Promise<CellValue> {
    const range = `'${sheetName}'!${cell}`;
    const rows = await this.readRange(spreadsheetId, range);
    return rows[0]?.[0] ?? null;
  }

  /**
   * Write values to a range (overwrites existing data)
   */
  async writeRange(
    spreadsheetId: string,
    range: string,
    values: Row[],
    options: WriteOptions = {},
  ): Promise<WriteResult> {
    const client = await this.getClient();

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: options.valueInputOption ?? 'USER_ENTERED',
        requestBody: {
          values,
        },
      });

      return {
        updatedRange: response.data.updatedRange ?? range,
        updatedRows: response.data.updatedRows ?? 0,
        updatedColumns: response.data.updatedColumns ?? 0,
        updatedCells: response.data.updatedCells ?? 0,
      };
    });
  }

  /**
   * Write multiple ranges in a single request
   */
  async writeRanges(
    spreadsheetId: string,
    data: Array<{ range: string; values: Row[] }>,
    options: WriteOptions = {},
  ): Promise<{ totalUpdatedCells: number }> {
    const client = await this.getClient();

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: options.valueInputOption ?? 'USER_ENTERED',
          data: data.map((rangeData) => ({
            range: rangeData.range,
            values: rangeData.values,
          })),
        },
      });

      return {
        totalUpdatedCells: response.data.totalUpdatedCells ?? 0,
      };
    });
  }

  /**
   * Append rows to a sheet (adds after existing data)
   */
  async appendRows(
    spreadsheetId: string,
    sheetName: string,
    rows: Row[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    const client = await this.getClient();
    const range = `'${sheetName}'`;

    return this.withErrorHandling(async () => {
      const response = await client.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: options.valueInputOption ?? 'USER_ENTERED',
        insertDataOption: options.insertDataOption ?? 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });

      return {
        updatedRange: response.data.updates?.updatedRange ?? '',
        updatedRows: response.data.updates?.updatedRows ?? 0,
        updatedCells: response.data.updates?.updatedCells ?? 0,
      };
    });
  }

  /**
   * Clear a range of cells
   */
  async clearRange(spreadsheetId: string, range: string): Promise<void> {
    const client = await this.getClient();

    await this.withErrorHandling(async () => {
      await client.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
    });
  }

  /**
   * Clear all data in a sheet
   */
  async clearSheet(spreadsheetId: string, sheetName: string): Promise<void> {
    await this.clearRange(spreadsheetId, `'${sheetName}'`);
  }

  /**
   * Add a new sheet to the spreadsheet
   *
   * @returns The new sheet's ID
   */
  async addSheet(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<{ sheetId: number }> {
    const client = this.getClient();

    return await this.withErrorHandling(async () => {
      const response = await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      const sheetId =
        response.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
      return { sheetId };
    });
  }

  /**
   * Delete a sheet from the spreadsheet
   */
  async deleteSheet(spreadsheetId: string, sheetId: number): Promise<void> {
    const client = this.getClient();

    await this.withErrorHandling(async () => {
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });
    });
  }

  /**
   * Get the index of the last row with data in a sheet
   *
   * @returns 1-based row index of the last row with data, or 0 if sheet is empty
   */
  async getLastDataRowIndex(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number> {
    const rows = await this.readAllRows(spreadsheetId, sheetName);
    return rows.length;
  }

  /**
   * Append rows with sparse cell updates (only writes to specified columns)
   *
   * This preserves any custom columns that are not part of the data being written.
   *
   * @param spreadsheetId - The spreadsheet ID
   * @param sheetName - The sheet name
   * @param rowsCellUpdates - Array of cell updates for each row to append
   * @param options - Write options
   */
  async appendRowsCells(
    spreadsheetId: string,
    sheetName: string,
    rowsCellUpdates: CellUpdate[][],
    options: WriteOptions = {},
  ): Promise<{ totalUpdatedCells: number; appendedRows: number }> {
    if (rowsCellUpdates.length === 0) {
      return { totalUpdatedCells: 0, appendedRows: 0 };
    }

    const lastRowIndex = await this.getLastDataRowIndex(
      spreadsheetId,
      sheetName,
    );
    const startRowIndex = lastRowIndex + 1;

    // Build all range-value pairs for batch write
    const allRangeData: Array<{ range: string; values: Row[] }> = [];

    for (let rowOffset = 0; rowOffset < rowsCellUpdates.length; rowOffset++) {
      const cellUpdates = rowsCellUpdates[rowOffset];
      if (!cellUpdates || cellUpdates.length === 0) {
        continue;
      }

      const rowIndex = startRowIndex + rowOffset;
      const groups = this.groupContiguousCells(cellUpdates);

      for (const group of groups) {
        allRangeData.push({
          range: this.buildRangeForGroup(sheetName, rowIndex, group),
          values: [group.map((cell) => cell.value)],
        });
      }
    }

    if (allRangeData.length === 0) {
      return { totalUpdatedCells: 0, appendedRows: 0 };
    }

    const result = await this.writeRanges(spreadsheetId, allRangeData, options);
    return {
      totalUpdatedCells: result.totalUpdatedCells,
      appendedRows: rowsCellUpdates.length,
    };
  }

  /**
   * Update specific cells in a row (sparse update)
   *
   * Only updates the specified columns, leaving other columns untouched.
   * This preserves any custom columns that are not part of the schema.
   *
   * @param spreadsheetId - The spreadsheet ID
   * @param sheetName - The sheet name
   * @param rowIndex - 1-based row index
   * @param cellUpdates - Array of cell updates with column index and value
   * @param options - Write options
   */
  async updateRowCells(
    spreadsheetId: string,
    sheetName: string,
    rowIndex: number,
    cellUpdates: CellUpdate[],
    options: WriteOptions = {},
  ): Promise<{ totalUpdatedCells: number }> {
    if (cellUpdates.length === 0) {
      return { totalUpdatedCells: 0 };
    }

    // Group contiguous columns to minimize API calls
    const groups = this.groupContiguousCells(cellUpdates);

    const data = groups.map((group) => ({
      range: this.buildRangeForGroup(sheetName, rowIndex, group),
      values: [group.map((cell) => cell.value)],
    }));

    return await this.writeRanges(spreadsheetId, data, options);
  }

  /**
   * Group contiguous cells together for efficient batch writes
   */
  private groupContiguousCells(cellUpdates: CellUpdate[]): CellUpdate[][] {
    if (cellUpdates.length === 0) {
      return [];
    }

    // Sort by column index
    const sorted = [...cellUpdates].sort(
      (cellA, cellB) => cellA.columnIndex - cellB.columnIndex,
    );

    const firstCell = sorted[0];
    if (!firstCell) {
      return [];
    }

    const groups: CellUpdate[][] = [];
    let currentGroup: CellUpdate[] = [firstCell];
    let lastColumnIndex = firstCell.columnIndex;

    for (let updateIndex = 1; updateIndex < sorted.length; updateIndex++) {
      const currentCell = sorted[updateIndex];
      if (!currentCell) {
        continue;
      }

      // Check if this cell is contiguous with the previous one
      if (currentCell.columnIndex === lastColumnIndex + 1) {
        currentGroup.push(currentCell);
      } else {
        groups.push(currentGroup);
        currentGroup = [currentCell];
      }
      lastColumnIndex = currentCell.columnIndex;
    }

    groups.push(currentGroup);
    return groups;
  }

  /**
   * Build A1 notation range for a group of contiguous cells
   */
  private buildRangeForGroup(
    sheetName: string,
    rowIndex: number,
    group: CellUpdate[],
  ): string {
    const firstCell = group[0];
    const lastCell = group[group.length - 1];

    if (!firstCell || !lastCell) {
      throw new Error('Cannot build range for empty group');
    }

    const startCol = columnIndexToLetter(firstCell.columnIndex);

    if (group.length === 1) {
      return `'${sheetName}'!${startCol}${rowIndex}`;
    }

    const endCol = columnIndexToLetter(lastCell.columnIndex);
    return `'${sheetName}'!${startCol}${rowIndex}:${endCol}${rowIndex}`;
  }
}
