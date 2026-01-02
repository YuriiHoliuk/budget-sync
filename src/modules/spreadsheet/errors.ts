/**
 * Spreadsheet module errors
 */

/** Base error for all spreadsheet-related errors */
export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

/** Error when schema validation fails (missing required columns) */
export class SchemaValidationError extends SpreadsheetError {
  constructor(
    public readonly missingColumns: string[],
    public readonly foundHeaders: string[],
  ) {
    super(
      `Schema validation failed. Missing required columns: ${missingColumns.join(', ')}. ` +
        `Found headers: ${foundHeaders.length > 0 ? foundHeaders.join(', ') : '(none)'}`,
    );
    this.name = 'SchemaValidationError';
  }
}

/** Error when a sheet is not found in the spreadsheet */
export class SheetNotFoundError extends SpreadsheetError {
  constructor(public readonly sheetName: string) {
    super(`Sheet "${sheetName}" not found in spreadsheet`);
    this.name = 'SheetNotFoundError';
  }
}

/** Error when spreadsheet API returns an error */
export class SpreadsheetApiError extends SpreadsheetError {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'SpreadsheetApiError';
  }
}

/** Error when rate limit is exceeded */
export class RateLimitError extends SpreadsheetApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/** Error when row parsing fails due to type mismatch */
export class RowParseError extends SpreadsheetError {
  constructor(
    public readonly rowIndex: number,
    public readonly columnName: string,
    public readonly expectedType: string,
    public readonly actualValue: unknown,
  ) {
    super(
      `Failed to parse row ${rowIndex}, column "${columnName}": ` +
        `expected ${expectedType}, got ${JSON.stringify(actualValue)}`,
    );
    this.name = 'RowParseError';
  }
}
