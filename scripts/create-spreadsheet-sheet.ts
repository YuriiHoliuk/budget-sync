#!/usr/bin/env bun
/**
 * Create a new sheet in the spreadsheet with optional headers.
 * Usage: bun scripts/create-spreadsheet-sheet.ts <sheetName> [header1] [header2] ...
 * Example: bun scripts/create-spreadsheet-sheet.ts "NewSheet"
 * Example: bun scripts/create-spreadsheet-sheet.ts "Transactions" "ID" "Date" "Amount" "Description"
 *
 * If headers are provided, they will be written to the first row of the new sheet.
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
  console.log('Usage: bun scripts/create-spreadsheet-sheet.ts <sheetName> [header1] [header2] ...');
  console.log('Example: bun scripts/create-spreadsheet-sheet.ts "NewSheet"');
  console.log('Example: bun scripts/create-spreadsheet-sheet.ts "Transactions" "ID" "Date" "Amount" "Description"');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: Sheet name is required.');
    printUsage();
    process.exit(1);
  }

  const sheetName = args[0];
  const headers = args.slice(1);

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
    // Check if sheet already exists
    const metadata = await client.getMetadata(spreadsheetId);
    const existingSheet = metadata.sheets.find((sheet) => sheet.title === sheetName);

    if (existingSheet) {
      console.error(`Error: Sheet "${sheetName}" already exists.`);
      process.exit(1);
    }

    // Create the new sheet
    const result = await client.addSheet(spreadsheetId, sheetName);
    console.log(`Created sheet "${sheetName}" with ID ${result.sheetId}.`);

    // Write headers if provided
    if (headers.length > 0) {
      const range = `'${sheetName}'!A1`;
      await client.writeRange(spreadsheetId, range, [headers]);
      console.log(`Added headers: ${JSON.stringify(headers)}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error creating sheet: ${error.message}`);
    } else {
      console.error('Error creating sheet: Unknown error');
    }
    process.exit(1);
  }
}

main();
