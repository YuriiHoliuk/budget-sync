import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Row, SheetInfo, WriteOptions } from '@modules/spreadsheet';
import { SpreadsheetsClient } from '@modules/spreadsheet';

type RangeData = { range: string; values: Row[] };
type WriteRangesFn = (
  spreadsheetId: string,
  data: RangeData[],
  options?: WriteOptions,
) => Promise<{ totalUpdatedCells: number }>;
type GetLastDataRowIndexFn = (
  spreadsheetId: string,
  sheetName: string,
) => Promise<number>;
type EnsureSheetCapacityFn = (
  spreadsheetId: string,
  sheetName: string,
  requiredRowCount: number,
  growthBuffer?: number,
) => Promise<void>;
type GetSheetInfoFn = (
  spreadsheetId: string,
  sheetName: string,
) => Promise<SheetInfo>;
type ExpandSheetRowsFn = (
  spreadsheetId: string,
  sheetId: number,
  newRowCount: number,
) => Promise<void>;

/**
 * Unit tests for SpreadsheetsClient sparse write functionality
 *
 * These tests verify that the grouping and range building logic works correctly
 * without making actual API calls.
 */
describe('SpreadsheetsClient', () => {
  describe('updateRowCells', () => {
    let client: SpreadsheetsClient;
    let mockWriteRanges: ReturnType<typeof mock<WriteRangesFn>>;

    beforeEach(() => {
      client = new SpreadsheetsClient();
      mockWriteRanges = mock<WriteRangesFn>(() =>
        Promise.resolve({ totalUpdatedCells: 3 }),
      );
      Object.assign(client, { writeRanges: mockWriteRanges });
    });

    test('should group contiguous columns into single range', async () => {
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 0, value: 'A' },
        { columnIndex: 1, value: 'B' },
        { columnIndex: 2, value: 'C' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A5:C5", values: [['A', 'B', 'C']] },
      ]);
    });

    test('should create separate ranges for non-contiguous columns', async () => {
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 0, value: 'A' },
        { columnIndex: 2, value: 'C' },
        { columnIndex: 4, value: 'E' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A5", values: [['A']] },
        { range: "'Sheet1'!C5", values: [['C']] },
        { range: "'Sheet1'!E5", values: [['E']] },
      ]);
    });

    test('should handle mixed contiguous and non-contiguous columns', async () => {
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 0, value: 'A' },
        { columnIndex: 1, value: 'B' },
        { columnIndex: 3, value: 'D' },
        { columnIndex: 4, value: 'E' },
        { columnIndex: 5, value: 'F' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A5:B5", values: [['A', 'B']] },
        { range: "'Sheet1'!D5:F5", values: [['D', 'E', 'F']] },
      ]);
    });

    test('should sort columns before grouping', async () => {
      // Pass columns out of order
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 2, value: 'C' },
        { columnIndex: 0, value: 'A' },
        { columnIndex: 1, value: 'B' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A5:C5", values: [['A', 'B', 'C']] },
      ]);
    });

    test('should handle single column', async () => {
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 3, value: 'D' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!D5", values: [['D']] },
      ]);
    });

    test('should handle empty cell updates', async () => {
      const result = await client.updateRowCells(
        'spreadsheet-id',
        'Sheet1',
        5,
        [],
      );

      expect(mockWriteRanges).not.toHaveBeenCalled();
      expect(result.totalUpdatedCells).toBe(0);
    });

    test('should handle columns beyond Z (AA, AB, etc)', async () => {
      await client.updateRowCells('spreadsheet-id', 'Sheet1', 5, [
        { columnIndex: 26, value: 'AA' },
        { columnIndex: 27, value: 'AB' },
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!AA5:AB5", values: [['AA', 'AB']] },
      ]);
    });
  });

  describe('appendRowsCells', () => {
    let client: SpreadsheetsClient;
    let mockWriteRanges: ReturnType<typeof mock<WriteRangesFn>>;
    let mockGetLastDataRowIndex: ReturnType<typeof mock<GetLastDataRowIndexFn>>;
    let mockEnsureSheetCapacity: ReturnType<typeof mock<EnsureSheetCapacityFn>>;

    beforeEach(() => {
      client = new SpreadsheetsClient();
      mockWriteRanges = mock<WriteRangesFn>(() =>
        Promise.resolve({ totalUpdatedCells: 6 }),
      );
      mockGetLastDataRowIndex = mock<GetLastDataRowIndexFn>(() =>
        Promise.resolve(10),
      );
      mockEnsureSheetCapacity = mock<EnsureSheetCapacityFn>(() =>
        Promise.resolve(),
      );
      Object.assign(client, {
        writeRanges: mockWriteRanges,
        getLastDataRowIndex: mockGetLastDataRowIndex,
        ensureSheetCapacity: mockEnsureSheetCapacity,
      });
    });

    test('should append multiple rows with sparse data', async () => {
      await client.appendRowsCells('spreadsheet-id', 'Sheet1', [
        [
          { columnIndex: 0, value: 'Row1-A' },
          { columnIndex: 2, value: 'Row1-C' },
        ],
        [
          { columnIndex: 0, value: 'Row2-A' },
          { columnIndex: 2, value: 'Row2-C' },
        ],
      ]);

      expect(mockGetLastDataRowIndex).toHaveBeenCalledTimes(1);
      expect(mockWriteRanges).toHaveBeenCalledTimes(1);

      // Rows should start at 11 (last row was 10)
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A11", values: [['Row1-A']] },
        { range: "'Sheet1'!C11", values: [['Row1-C']] },
        { range: "'Sheet1'!A12", values: [['Row2-A']] },
        { range: "'Sheet1'!C12", values: [['Row2-C']] },
      ]);
    });

    test('should handle empty rows array', async () => {
      const result = await client.appendRowsCells(
        'spreadsheet-id',
        'Sheet1',
        [],
      );

      expect(mockGetLastDataRowIndex).not.toHaveBeenCalled();
      expect(mockWriteRanges).not.toHaveBeenCalled();
      expect(result.totalUpdatedCells).toBe(0);
      expect(result.appendedRows).toBe(0);
    });

    test('should skip empty cell updates in rows', async () => {
      await client.appendRowsCells('spreadsheet-id', 'Sheet1', [
        [{ columnIndex: 0, value: 'Row1-A' }],
        [], // Empty row - should be skipped
        [{ columnIndex: 0, value: 'Row3-A' }],
      ]);

      expect(mockWriteRanges).toHaveBeenCalledTimes(1);
      // Row indices should still be sequential (11, 12, 13)
      expect(mockWriteRanges.mock.calls[0]?.[1]).toEqual([
        { range: "'Sheet1'!A11", values: [['Row1-A']] },
        { range: "'Sheet1'!A13", values: [['Row3-A']] },
      ]);
    });

    test('should return correct appendedRows count', async () => {
      const result = await client.appendRowsCells('spreadsheet-id', 'Sheet1', [
        [{ columnIndex: 0, value: 'A' }],
        [{ columnIndex: 0, value: 'B' }],
        [{ columnIndex: 0, value: 'C' }],
      ]);

      expect(result.appendedRows).toBe(3);
    });

    test('should ensure sheet capacity before appending', async () => {
      await client.appendRowsCells('spreadsheet-id', 'Sheet1', [
        [{ columnIndex: 0, value: 'Row1-A' }],
        [{ columnIndex: 0, value: 'Row2-A' }],
      ]);

      // Last row was 10, appending 2 rows means we need rows 11 and 12
      // So required row count is 12
      expect(mockEnsureSheetCapacity).toHaveBeenCalledTimes(1);
      expect(mockEnsureSheetCapacity).toHaveBeenCalledWith(
        'spreadsheet-id',
        'Sheet1',
        12,
      );
    });

    test('should call ensureSheetCapacity before writeRanges', async () => {
      const callOrder: string[] = [];

      mockEnsureSheetCapacity = mock<EnsureSheetCapacityFn>(() => {
        callOrder.push('ensureSheetCapacity');
        return Promise.resolve();
      });

      mockWriteRanges = mock<WriteRangesFn>(() => {
        callOrder.push('writeRanges');
        return Promise.resolve({ totalUpdatedCells: 1 });
      });

      Object.assign(client, {
        writeRanges: mockWriteRanges,
        ensureSheetCapacity: mockEnsureSheetCapacity,
      });

      await client.appendRowsCells('spreadsheet-id', 'Sheet1', [
        [{ columnIndex: 0, value: 'A' }],
      ]);

      expect(callOrder).toEqual(['ensureSheetCapacity', 'writeRanges']);
    });
  });

  describe('ensureSheetCapacity', () => {
    let client: SpreadsheetsClient;
    let mockGetSheetInfo: ReturnType<typeof mock<GetSheetInfoFn>>;
    let mockExpandSheetRows: ReturnType<typeof mock<ExpandSheetRowsFn>>;

    beforeEach(() => {
      client = new SpreadsheetsClient();
      mockExpandSheetRows = mock<ExpandSheetRowsFn>(() => Promise.resolve());
    });

    test('should expand sheet when required rows exceed current capacity', async () => {
      mockGetSheetInfo = mock<GetSheetInfoFn>(() =>
        Promise.resolve({
          id: 123,
          title: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
        }),
      );

      Object.assign(client, {
        getSheetInfo: mockGetSheetInfo,
        expandSheetRows: mockExpandSheetRows,
      });

      await client.ensureSheetCapacity('spreadsheet-id', 'Sheet1', 150);

      expect(mockGetSheetInfo).toHaveBeenCalledWith('spreadsheet-id', 'Sheet1');
      expect(mockExpandSheetRows).toHaveBeenCalledWith(
        'spreadsheet-id',
        123,
        250, // 150 + 100 (default buffer)
      );
    });

    test('should not expand sheet when capacity is sufficient', async () => {
      mockGetSheetInfo = mock<GetSheetInfoFn>(() =>
        Promise.resolve({
          id: 123,
          title: 'Sheet1',
          rowCount: 200,
          columnCount: 26,
        }),
      );

      Object.assign(client, {
        getSheetInfo: mockGetSheetInfo,
        expandSheetRows: mockExpandSheetRows,
      });

      await client.ensureSheetCapacity('spreadsheet-id', 'Sheet1', 150);

      expect(mockGetSheetInfo).toHaveBeenCalledWith('spreadsheet-id', 'Sheet1');
      expect(mockExpandSheetRows).not.toHaveBeenCalled();
    });

    test('should use custom growth buffer when provided', async () => {
      mockGetSheetInfo = mock<GetSheetInfoFn>(() =>
        Promise.resolve({
          id: 456,
          title: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
        }),
      );

      Object.assign(client, {
        getSheetInfo: mockGetSheetInfo,
        expandSheetRows: mockExpandSheetRows,
      });

      await client.ensureSheetCapacity('spreadsheet-id', 'Sheet1', 150, 500);

      expect(mockExpandSheetRows).toHaveBeenCalledWith(
        'spreadsheet-id',
        456,
        650, // 150 + 500 (custom buffer)
      );
    });

    test('should expand when required equals current (boundary case)', async () => {
      mockGetSheetInfo = mock<GetSheetInfoFn>(() =>
        Promise.resolve({
          id: 789,
          title: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
        }),
      );

      Object.assign(client, {
        getSheetInfo: mockGetSheetInfo,
        expandSheetRows: mockExpandSheetRows,
      });

      // When required equals current, we should NOT expand
      await client.ensureSheetCapacity('spreadsheet-id', 'Sheet1', 100);

      expect(mockExpandSheetRows).not.toHaveBeenCalled();
    });

    test('should expand when required is one more than current', async () => {
      mockGetSheetInfo = mock<GetSheetInfoFn>(() =>
        Promise.resolve({
          id: 789,
          title: 'Sheet1',
          rowCount: 100,
          columnCount: 26,
        }),
      );

      Object.assign(client, {
        getSheetInfo: mockGetSheetInfo,
        expandSheetRows: mockExpandSheetRows,
      });

      // When required is one more than current, we should expand
      await client.ensureSheetCapacity('spreadsheet-id', 'Sheet1', 101);

      expect(mockExpandSheetRows).toHaveBeenCalledWith(
        'spreadsheet-id',
        789,
        201, // 101 + 100 (default buffer)
      );
    });
  });
});
