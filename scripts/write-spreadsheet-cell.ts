#!/usr/bin/env bun
/**
 * Write a value or formula to a specific cell in a spreadsheet sheet.
 * Usage: bun scripts/write-spreadsheet-cell.ts <sheetName> <cell> <value>
 * Example: bun scripts/write-spreadsheet-cell.ts "Бюджети" "A2" "=ROW()-1"
 * Example: bun scripts/write-spreadsheet-cell.ts "Транзакції" "B5" "Hello World"
 *
 * The cell reference should be in A1 notation (e.g., A1, B2, AA10).
 * Values starting with "=" are treated as formulas.
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
  console.log('Usage: bun scripts/write-spreadsheet-cell.ts <sheetName> <cell> <value>');
  console.log('Example: bun scripts/write-spreadsheet-cell.ts "Бюджети" "A2" "=ROW()-1"');
  console.log('Example: bun scripts/write-spreadsheet-cell.ts "Транзакції" "B5" "Hello World"');
  console.log('');
  console.log('The cell reference should be in A1 notation (e.g., A1, B2, AA10).');
  console.log('Values starting with "=" are treated as formulas.');
}

function isValidCellReference(cell: string): boolean {
  // A1 notation: one or more letters followed by one or more digits
  return /^[A-Za-z]+[1-9][0-9]*$/.test(cell);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    console.error('Error: Exactly 3 arguments required: sheetName, cell, and value.');
    printUsage();
    process.exit(1);
  }

  const sheetName = args[0];
  const cell = args[1];
  const value = args[2];

  if (!sheetName || !cell || value === undefined) {
    console.error('Error: All arguments are required.');
    printUsage();
    process.exit(1);
  }

  if (!isValidCellReference(cell)) {
    console.error(`Error: Invalid cell reference "${cell}". Use A1 notation (e.g., A1, B2, AA10).`);
    printUsage();
    process.exit(1);
  }

  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    const range = `'${sheetName}'!${cell.toUpperCase()}`;
    const result = await client.writeRange(spreadsheetId, range, [[value]]);

    const isFormula = value.startsWith('=');
    const valueType = isFormula ? 'formula' : 'value';

    console.log(`Written ${valueType} to ${result.updatedRange}`);
    console.log(`Value: ${value}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error writing to cell: ${error.message}`);
    } else {
      console.error('Error writing to cell: Unknown error');
    }
    process.exit(1);
  }
}

main();
