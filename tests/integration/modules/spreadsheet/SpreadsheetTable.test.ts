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

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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

/**
 * Tests for sparse write functionality (updateRowAt, appendRows)
 *
 * These tests verify that custom columns (not part of schema) are preserved
 * during write operations. Uses a temporary test sheet that is created at
 * the start and deleted at the end.
 */
describe('SpreadsheetTable Sparse Writes Integration', () => {
  let client: SpreadsheetsClient;
  let testSheetId: number;
  const TEST_SHEET_NAME = `SparseWriteTest_${Date.now()}`;

  /**
   * Test sheet structure with custom columns BETWEEN schema columns:
   *
   * | Назва | Custom1 | Сума | Custom2 | Дата |
   * |   A   |    B    |  C   |    D    |   E  |
   *
   * Schema only knows about: Назва (A), Сума (C), Дата (E)
   * Custom columns: Custom1 (B), Custom2 (D)
   */
  const sparseSchema = {
    name: { name: 'Назва', type: 'string', required: true },
    amount: { name: 'Сума', type: 'number', required: true },
    date: { name: 'Дата', type: 'string', required: true },
  } as const satisfies Record<string, ColumnDefinition>;

  beforeAll(async () => {
    const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

    if (!serviceAccountFile) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE env variable is required');
    }

    client = new SpreadsheetsClient({ serviceAccountFile });

    // Create temporary test sheet
    const result = await client.addSheet(TEST_SPREADSHEET.id, TEST_SHEET_NAME);
    testSheetId = result.sheetId;

    // Set up headers with custom columns between schema columns
    // Structure: Назва | Custom1 | Сума | Custom2 | Дата
    await client.writeRange(TEST_SPREADSHEET.id, `'${TEST_SHEET_NAME}'!A1:E1`, [
      ['Назва', 'Custom1', 'Сума', 'Custom2', 'Дата'],
    ]);

    // Add initial test data with custom column values
    await client.writeRange(TEST_SPREADSHEET.id, `'${TEST_SHEET_NAME}'!A2:E3`, [
      ['Item1', 'CustomVal1-1', '100', 'CustomVal2-1', '01.01.2026'],
      ['Item2', 'CustomVal1-2', '200', 'CustomVal2-2', '02.01.2026'],
    ]);
  });

  afterAll(async () => {
    // Clean up: delete the temporary test sheet
    if (testSheetId) {
      await client.deleteSheet(TEST_SPREADSHEET.id, testSheetId);
    }
  });

  describe('updateRowAt', () => {
    test('should preserve custom columns when updating a row', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        sparseSchema,
      );
      await table.validateSchema();

      // Verify custom columns exist before update
      const rowBefore = await client.readRow(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        2,
      );
      expect(rowBefore?.[1]).toBe('CustomVal1-1'); // Custom1
      expect(rowBefore?.[3]).toBe('CustomVal2-1'); // Custom2

      // Update the row using schema columns only
      await table.updateRowAt(2, {
        name: 'UpdatedItem1',
        amount: 150,
        date: '15.01.2026',
      });

      // Verify custom columns are preserved after update
      const rowAfter = await client.readRow(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        2,
      );

      // Schema columns should be updated
      expect(rowAfter?.[0]).toBe('UpdatedItem1'); // Назва
      expect(rowAfter?.[2]).toBe('150'); // Сума (formatted as string)
      expect(rowAfter?.[4]).toBe('15.01.2026'); // Дата

      // Custom columns should be preserved
      expect(rowAfter?.[1]).toBe('CustomVal1-1'); // Custom1 - PRESERVED
      expect(rowAfter?.[3]).toBe('CustomVal2-1'); // Custom2 - PRESERVED
    });

    test('should handle multiple updates preserving custom columns', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        sparseSchema,
      );
      await table.validateSchema();

      // Update row 3
      await table.updateRowAt(3, {
        name: 'UpdatedItem2',
        amount: 250,
        date: '25.01.2026',
      });

      const row = await client.readRow(TEST_SPREADSHEET.id, TEST_SHEET_NAME, 3);

      // Schema columns updated
      expect(row?.[0]).toBe('UpdatedItem2');
      expect(row?.[2]).toBe('250');
      expect(row?.[4]).toBe('25.01.2026');

      // Custom columns preserved
      expect(row?.[1]).toBe('CustomVal1-2');
      expect(row?.[3]).toBe('CustomVal2-2');
    });
  });

  describe('appendRows', () => {
    test('should append rows without affecting custom column positions', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        sparseSchema,
      );
      await table.validateSchema();

      // Get current row count
      const rowsBefore = await client.readAllRows(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
      );
      const rowCountBefore = rowsBefore.length;

      // Append a new row
      await table.appendRows([
        {
          name: 'NewItem',
          amount: 300,
          date: '30.01.2026',
        },
      ]);

      // Verify new row was added
      const rowsAfter = await client.readAllRows(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
      );
      expect(rowsAfter.length).toBe(rowCountBefore + 1);

      // Verify new row has correct schema values
      const newRow = rowsAfter[rowsAfter.length - 1];
      expect(newRow?.[0]).toBe('NewItem'); // Назва at index 0
      expect(newRow?.[2]).toBe('300'); // Сума at index 2
      expect(newRow?.[4]).toBe('30.01.2026'); // Дата at index 4

      // Custom columns should be empty (not null-overwritten)
      expect(newRow?.[1]).toBeFalsy(); // Custom1 - empty
      expect(newRow?.[3]).toBeFalsy(); // Custom2 - empty
    });

    test('should append multiple rows correctly', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        sparseSchema,
      );
      await table.validateSchema();

      const rowsBefore = await client.readAllRows(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
      );
      const rowCountBefore = rowsBefore.length;

      // Append multiple rows
      await table.appendRows([
        { name: 'BatchItem1', amount: 400, date: '01.02.2026' },
        { name: 'BatchItem2', amount: 500, date: '02.02.2026' },
      ]);

      const rowsAfter = await client.readAllRows(
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
      );
      expect(rowsAfter.length).toBe(rowCountBefore + 2);

      // Verify both rows
      const newRow1 = rowsAfter[rowsAfter.length - 2];
      const newRow2 = rowsAfter[rowsAfter.length - 1];

      expect(newRow1?.[0]).toBe('BatchItem1');
      expect(newRow1?.[2]).toBe('400');

      expect(newRow2?.[0]).toBe('BatchItem2');
      expect(newRow2?.[2]).toBe('500');
    });
  });

  describe('column order independence', () => {
    test('should work correctly when custom columns are at different positions', async () => {
      const table = new SpreadsheetTable(
        client,
        TEST_SPREADSHEET.id,
        TEST_SHEET_NAME,
        sparseSchema,
      );

      const validatedSchema = await table.validateSchema();

      // Verify schema found columns at correct positions
      // With headers: Назва | Custom1 | Сума | Custom2 | Дата
      //   Indices:      0   |    1    |   2  |    3    |   4
      expect(validatedSchema.columnIndices.name).toBe(0);
      expect(validatedSchema.columnIndices.amount).toBe(2);
      expect(validatedSchema.columnIndices.date).toBe(4);

      // The schema should NOT know about custom columns (indices 1 and 3)
      expect(Object.keys(validatedSchema.columnIndices)).toEqual([
        'name',
        'amount',
        'date',
      ]);
    });
  });
});
