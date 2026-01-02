#!/usr/bin/env bun
/**
 * Add columns to a spreadsheet sheet (at the end of existing headers).
 * Usage: bun scripts/add-spreadsheet-columns.ts <sheetName> <column1> [column2] ...
 * Example: bun scripts/add-spreadsheet-columns.ts "Рахунки" "ID (зовнішній)" "IBAN"
 */

import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function printUsage(): void {
  console.log('Usage: bun scripts/add-spreadsheet-columns.ts <sheetName> <column1> [column2] ...');
  console.log('Example: bun scripts/add-spreadsheet-columns.ts "Рахунки" "ID (зовнішній)" "IBAN"');
}

/**
 * Convert column index (0-based) to A1 notation column letter(s).
 * 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA, 27 -> AB, etc.
 */
function columnIndexToLetter(columnIndex: number): string {
  let result = '';
  let remaining = columnIndex;

  while (remaining >= 0) {
    result = String.fromCharCode((remaining % 26) + 65) + result;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Error: Sheet name and at least one column name are required.');
    printUsage();
    process.exit(1);
  }

  const sheetName = args[0];
  const columnsToAdd = args.slice(1);

  if (!sheetName) {
    console.error('Error: Sheet name is required.');
    printUsage();
    process.exit(1);
  }

  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    // Read existing headers
    const existingHeaders = await client.readHeaders(spreadsheetId, sheetName);
    const existingHeadersSet = new Set(existingHeaders);

    // Filter out columns that already exist
    const newColumns = columnsToAdd.filter((column) => !existingHeadersSet.has(column));
    const skippedColumns = columnsToAdd.filter((column) => existingHeadersSet.has(column));

    if (skippedColumns.length > 0) {
      console.log(`Skipping already existing columns: ${JSON.stringify(skippedColumns)}`);
    }

    if (newColumns.length === 0) {
      console.log('No new columns to add. All specified columns already exist.');
      return;
    }

    // Calculate the starting column for new headers
    const startColumnIndex = existingHeaders.length;
    const startColumn = columnIndexToLetter(startColumnIndex);
    const endColumn = columnIndexToLetter(startColumnIndex + newColumns.length - 1);

    // Build the range for writing new headers (row 1 is the header row)
    const range = `'${sheetName}'!${startColumn}1:${endColumn}1`;

    // Write new headers
    await client.writeRange(spreadsheetId, range, [newColumns]);

    console.log(`Added columns: ${JSON.stringify(newColumns)}`);
    console.log(`Written to range: ${range}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error adding columns: ${error.message}`);
    } else {
      console.error('Error adding columns: Unknown error');
    }
    process.exit(1);
  }
}

main();
