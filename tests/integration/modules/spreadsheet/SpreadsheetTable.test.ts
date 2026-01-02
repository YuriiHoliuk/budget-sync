/**
 * Integration tests for SpreadsheetTable
 *
 * Uses a dedicated test spreadsheet to avoid affecting production data.
 * The test spreadsheet structure is hardcoded and should not be modified.
 *
 * Test spreadsheet: https://docs.google.com/spreadsheets/d/1r7eMI2EIHa6g4zwYyUBfiN2W_1D8DRrAdDXRCrtC8vc
 *
 * Run with: bun test tests/integration/modules/spreadsheet/SpreadsheetTable.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import {
  type ColumnDefinition,
  SchemaValidationError,
  SpreadsheetsClient,
  SpreadsheetTable,
} from '@modules/spreadsheet';

/** Test spreadsheet configuration - hardcoded for stability */
const TEST_SPREADSHEET = {
  id: '1r7eMI2EIHa6g4zwYyUBfiN2W_1D8DRrAdDXRCrtC8vc',
  title: 'Test spreadsheet module',
  sheets: {
    records: {
      name: 'Записи',
      headers: ['Назва', 'Сума', 'Дата'],
      data: [
        { name: 'Кава', amount: 50, date: '01.01.2026' },
        { name: 'Тренерка', amount: 700, date: '02.01.2026' },
      ],
    },
  },
};

/** Schema matching the test spreadsheet structure */
const recordsSchema = {
  name: { name: 'Назва', type: 'string', required: true },
  amount: { name: 'Сума', type: 'number', required: true },
  date: { name: 'Дата', type: 'string', required: true },
} as const satisfies Record<string, ColumnDefinition>;

describe('SpreadsheetTable Integration', () => {
  let client: SpreadsheetsClient;

  beforeAll(() => {
    const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

    if (!serviceAccountFile) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE env variable is required');
    }

    client = new SpreadsheetsClient({ serviceAccountFile });
  });

  describe('validateSchema', () => {
    test('should validate schema when all required columns exist', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );

      const validatedSchema = await table.validateSchema();

      expect(validatedSchema.headers).toContain('Назва');
      expect(validatedSchema.headers).toContain('Сума');
      expect(validatedSchema.headers).toContain('Дата');

      // Column indices should be populated
      expect(validatedSchema.columnIndices.name).toBe(0);
      expect(validatedSchema.columnIndices.amount).toBe(1);
      expect(validatedSchema.columnIndices.date).toBe(2);
    });

    test('should throw SchemaValidationError when required columns are missing', async () => {
      const invalidSchema = {
        name: { name: 'Назва', type: 'string', required: true },
        nonExistent: {
          name: 'NonExistentColumn',
          type: 'string',
          required: true,
        },
      } as const satisfies Record<string, ColumnDefinition>;

      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        invalidSchema,
      );

      await expect(table.validateSchema()).rejects.toThrow(
        SchemaValidationError,
      );

      try {
        await table.validateSchema();
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          expect(error.missingColumns).toContain('NonExistentColumn');
        }
      }
    });

    test('should allow optional columns to be missing', async () => {
      const schemaWithOptional = {
        name: { name: 'Назва', type: 'string', required: true },
        optional: { name: 'OptionalColumn', type: 'string', required: false },
      } as const satisfies Record<string, ColumnDefinition>;

      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        schemaWithOptional,
      );

      // Should not throw even though OptionalColumn doesn't exist
      const validatedSchema = await table.validateSchema();
      expect(validatedSchema.columnIndices.name).toBe(0);
      expect(validatedSchema.columnIndices.optional).toBeUndefined();
    });
  });

  describe('readRows', () => {
    test('should read and parse rows according to schema', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );

      const rows = await table.readRows();

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(2);

      // Verify first row
      const firstRow = rows[0];
      expect(firstRow).toBeDefined();
      expect(firstRow?.name).toBe('Кава');
      expect(firstRow?.amount).toBe(50);
      expect(firstRow?.date).toBe('01.01.2026');

      // Verify second row
      const secondRow = rows[1];
      expect(secondRow).toBeDefined();
      expect(secondRow?.name).toBe('Тренерка');
      expect(secondRow?.amount).toBe(700);
      expect(secondRow?.date).toBe('02.01.2026');
    });

    test('should parse numbers correctly', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );

      const rows = await table.readRows();

      expect(typeof rows[0]?.amount).toBe('number');
      expect(rows[0]?.amount).toBe(50);
      expect(rows[1]?.amount).toBe(700);
    });
  });

  describe('readRowAt', () => {
    test('should read a specific row by index', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      // Row 2 is the first data row (row 1 is header)
      const row = await table.readRowAt(2);

      expect(row).not.toBeNull();
      expect(row?.name).toBe('Кава');
      expect(row?.amount).toBe(50);
    });

    test('should return null for empty row', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      // Try to read a row far beyond data
      const row = await table.readRowAt(1000);

      expect(row).toBeNull();
    });

    test('should throw for row index less than 2', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      await expect(table.readRowAt(1)).rejects.toThrow();
    });
  });

  describe('findRows', () => {
    test('should find rows matching a predicate', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      // Find rows with amount greater than 100
      const results = await table.findRows((row) => row.amount > 100);

      expect(results.length).toBe(1);
      expect(results[0]?.record.name).toBe('Тренерка');
      expect(results[0]?.record.amount).toBe(700);
      expect(results[0]?.rowIndex).toBe(3); // Third row in spreadsheet
    });

    test('should return empty array when no rows match', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      const results = await table.findRows((row) => row.amount > 10000);

      expect(results.length).toBe(0);
    });
  });

  describe('findRow', () => {
    test('should find the first row matching a predicate', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      const result = await table.findRow((row) => row.name === 'Кава');

      expect(result).not.toBeNull();
      expect(result?.record.name).toBe('Кава');
      expect(result?.record.amount).toBe(50);
      expect(result?.rowIndex).toBe(2);
    });

    test('should return null when no row matches', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );
      await table.validateSchema();

      const result = await table.findRow((row) => row.name === 'NonExistent');

      expect(result).toBeNull();
    });
  });

  describe('isValidated', () => {
    test('should return false before validation', () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );

      expect(table.isValidated()).toBe(false);
    });

    test('should return true after validation', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SPREADSHEET.sheets.records.name,
        recordsSchema,
      );

      await table.validateSchema();

      expect(table.isValidated()).toBe(true);
    });
  });
});
