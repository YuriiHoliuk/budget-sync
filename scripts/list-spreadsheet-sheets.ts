#!/usr/bin/env bun
/**
 * List all sheets in the spreadsheet.
 * Usage: bun scripts/list-spreadsheet-sheets.ts
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

async function main(): Promise<void> {
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    const metadata = await client.getMetadata(spreadsheetId);
    const sheetNames = metadata.sheets.map((sheet) => sheet.title);
    console.log(JSON.stringify(sheetNames, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error listing sheets: ${error.message}`);
    } else {
      console.error('Error listing sheets: Unknown error');
    }
    process.exit(1);
  }
}

main();
