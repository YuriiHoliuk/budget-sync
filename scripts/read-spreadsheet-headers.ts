#!/usr/bin/env bun
/**
 * Read headers from a spreadsheet sheet.
 * Usage: bun scripts/read-spreadsheet-headers.ts <sheetName>
 * Example: bun scripts/read-spreadsheet-headers.ts "Рахунки"
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
  console.log('Usage: bun scripts/read-spreadsheet-headers.ts <sheetName>');
  console.log('Example: bun scripts/read-spreadsheet-headers.ts "Рахунки"');
}

async function main(): Promise<void> {
  const sheetName = process.argv[2];

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
    const headers = await client.readHeaders(spreadsheetId, sheetName);
    console.log(JSON.stringify(headers, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error reading headers: ${error.message}`);
    } else {
      console.error('Error reading headers: Unknown error');
    }
    process.exit(1);
  }
}

main();
