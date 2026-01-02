/**
 * Integration tests for SpreadsheetsClient
 *
 * Uses a dedicated test spreadsheet to avoid affecting production data.
 * The test spreadsheet structure is hardcoded and should not be modified.
 *
 * Test spreadsheet: https://docs.google.com/spreadsheets/d/1r7eMI2EIHa6g4zwYyUBfiN2W_1D8DRrAdDXRCrtC8vc
 *
 * Run with: bun test tests/integration/modules/spreadsheet/SpreadsheetsClient.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { SheetNotFoundError, SpreadsheetsClient } from '@modules/spreadsheet';

/** Test spreadsheet configuration - hardcoded for stability */
const TEST_SPREADSHEET = {
  id: '1r7eMI2EIHa6g4zwYyUBfiN2W_1D8DRrAdDXRCrtC8vc',
  title: 'Test spreadsheet module',
  sheets: {
    records: {
      name: 'Записи',
      headers: ['Назва', 'Сума', 'Дата'],
      expectedRowCount: 3, // 1 header + 2 data rows
    },
  },
};

describe('SpreadsheetsClient Integration', () => {
  let client: SpreadsheetsClient;

  beforeAll(() => {
    const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

    if (!serviceAccountFile) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE env variable is required');
    }

    client = new SpreadsheetsClient({ serviceAccountFile });
  });

  describe('getMetadata', () => {
    test('should return spreadsheet metadata with correct title', async () => {
      const metadata = await client.getMetadata(TEST_SPREADSHEET.id);

      expect(metadata.spreadsheetId).toBe(TEST_SPREADSHEET.id);
      expect(metadata.title).toBe(TEST_SPREADSHEET.title);
      expect(Array.isArray(metadata.sheets)).toBe(true);
      expect(metadata.sheets.length).toBeGreaterThan(0);
    });

    test('should return sheet info with correct properties', async () => {
      const metadata = await client.getMetadata(TEST_SPREADSHEET.id);
      const recordsSheet = metadata.sheets.find(
        (sheet) => sheet.title === TEST_SPREADSHEET.sheets.records.name,
      );

      expect(recordsSheet).toBeDefined();
      expect(typeof recordsSheet?.id).toBe('number');
      expect(typeof recordsSheet?.rowCount).toBe('number');
      expect(typeof recordsSheet?.columnCount).toBe('number');
    });
  });

  describe('getSheetInfo', () => {
    test('should return info for existing sheet', async () => {
      const sheetInfo = await client.getSheetInfo(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
      );

      expect(sheetInfo.title).toBe(TEST_SPREADSHEET.sheets.records.name);
      expect(typeof sheetInfo.id).toBe('number');
    });

    test('should throw SheetNotFoundError for non-existent sheet', async () => {
      await expect(
        client.getSheetInfo(TEST_SPREADSHEET.id, 'NonExistentSheet12345'),
      ).rejects.toThrow(SheetNotFoundError);
    });
  });

  describe('readRange', () => {
    test('should read data from a range', async () => {
      const range = `'${TEST_SPREADSHEET.sheets.records.name}'!A1:C5`;
      const rows = await client.readRange(TEST_SPREADSHEET.id, range);

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThanOrEqual(1);

      // First row should be headers
      const headers = rows[0];
      expect(headers).toBeDefined();
      expect(headers?.[0]).toBe('Назва');
      expect(headers?.[1]).toBe('Сума');
    });
  });

  describe('readHeaders', () => {
    test('should read the first row as headers', async () => {
      const headers = await client.readHeaders(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
      );

      expect(Array.isArray(headers)).toBe(true);
      expect(headers[0]).toBe('Назва');
      expect(headers[1]).toBe('Сума');
    });
  });

  describe('readAllRows', () => {
    test('should read all rows from a sheet', async () => {
      const rows = await client.readAllRows(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
      );

      expect(Array.isArray(rows)).toBe(true);
      // Should have at least header + 2 data rows
      expect(rows.length).toBeGreaterThanOrEqual(3);

      // Verify first data row
      const firstDataRow = rows[1];
      expect(firstDataRow).toBeDefined();
      expect(firstDataRow?.[0]).toBe('Кава');
      expect(firstDataRow?.[1]).toBe('50');
    });
  });

  describe('readRow', () => {
    test('should read a specific row by index', async () => {
      const row = await client.readRow(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        2, // Second row (first data row)
      );

      expect(row).not.toBeNull();
      expect(row?.[0]).toBe('Кава');
      expect(row?.[1]).toBe('50');
    });

    test('should return null for empty row', async () => {
      const row = await client.readRow(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        1000, // Far beyond data
      );

      expect(row).toBeNull();
    });
  });

  describe('readCell', () => {
    test('should read a single cell value', async () => {
      const value = await client.readCell(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        'A1',
      );

      expect(value).toBe('Назва');
    });

    test('should read cell from data row', async () => {
      const value = await client.readCell(
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        'A2',
      );

      expect(value).toBe('Кава');
    });
  });
});
