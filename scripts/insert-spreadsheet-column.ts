#!/usr/bin/env bun
/**
 * Insert a column at a specific position in a spreadsheet sheet.
 * Usage: bun scripts/insert-spreadsheet-column.ts <sheetName> <columnName> <position>
 * Example: bun scripts/insert-spreadsheet-column.ts "Транзакції" "Category" 3
 *
 * Position is 1-based (1 = first column).
 * Existing columns at and after the position are shifted to the right.
 */

import { google } from 'googleapis';
import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';
import { columnIndexToLetter } from '../src/modules/spreadsheet/utils.ts';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function printUsage(): void {
  console.log('Usage: bun scripts/insert-spreadsheet-column.ts <sheetName> <columnName> <position>');
  console.log('Example: bun scripts/insert-spreadsheet-column.ts "Транзакції" "Category" 3');
  console.log('');
  console.log('Position is 1-based (1 = first column).');
}

async function getSheetId(
  spreadsheetId: string,
  sheetName: string,
  serviceAccountFile: string,
): Promise<number> {
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const sheet = response.data.sheets?.find(
    (sheetData) => sheetData.properties?.title === sheetName,
  );

  if (!sheet || sheet.properties?.sheetId === undefined) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  return sheet.properties.sheetId;
}

async function insertColumn(
  spreadsheetId: string,
  sheetId: number,
  columnIndex: number,
  serviceAccountFile: string,
): Promise<void> {
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: columnIndex,
              endIndex: columnIndex + 1,
            },
            inheritFromBefore: columnIndex > 0,
          },
        },
      ],
    },
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    console.error('Error: Exactly 3 arguments required: sheetName, columnName, and position.');
    printUsage();
    process.exit(1);
  }

  const sheetName = args[0];
  const columnName = args[1];
  const positionArg = args[2];

  if (!sheetName || !columnName || !positionArg) {
    console.error('Error: All arguments are required.');
    printUsage();
    process.exit(1);
  }

  const position = Number.parseInt(positionArg, 10);
  if (Number.isNaN(position) || position < 1) {
    console.error('Error: Position must be a positive integer (1-based).');
    printUsage();
    process.exit(1);
  }

  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    // Read existing headers to check for duplicates
    const existingHeaders = await client.readHeaders(spreadsheetId, sheetName);

    if (existingHeaders.includes(columnName)) {
      console.error(`Error: Column "${columnName}" already exists in sheet "${sheetName}".`);
      process.exit(1);
    }

    // Validate position
    const maxPosition = existingHeaders.length + 1;
    if (position > maxPosition) {
      console.error(`Error: Position ${position} is beyond the last column. Maximum is ${maxPosition}.`);
      process.exit(1);
    }

    // Get the sheet ID (required for batchUpdate)
    const sheetId = await getSheetId(spreadsheetId, sheetName, serviceAccountFile);

    // Insert a blank column at the specified position (0-based index)
    const columnIndex = position - 1;
    await insertColumn(spreadsheetId, sheetId, columnIndex, serviceAccountFile);

    // Write the header name to the new column
    const columnLetter = columnIndexToLetter(columnIndex);
    const range = `'${sheetName}'!${columnLetter}1`;
    await client.writeRange(spreadsheetId, range, [[columnName]]);

    console.log(`Inserted column "${columnName}" at position ${position} (column ${columnLetter}).`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error inserting column: ${error.message}`);
    } else {
      console.error('Error inserting column: Unknown error');
    }
    process.exit(1);
  }
}

main();
