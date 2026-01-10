#!/usr/bin/env bun
/**
 * Read all data from a spreadsheet sheet.
 * Usage: bun scripts/read-spreadsheet-data.ts <sheetName> [--formulas]
 * Example: bun scripts/read-spreadsheet-data.ts "Бюджети"
 * Example: bun scripts/read-spreadsheet-data.ts "Бюджети" --formulas
 *
 * Without --formulas: shows formatted values (default)
 * With --formulas: shows FORMULA values instead
 * Output as JSON with headers and rows.
 */

import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';
import type { ReadOptions } from '../src/modules/spreadsheet/types.ts';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function printUsage(): void {
  console.log('Usage: bun scripts/read-spreadsheet-data.ts <sheetName> [--formulas]');
  console.log('Example: bun scripts/read-spreadsheet-data.ts "Бюджети"');
  console.log('Example: bun scripts/read-spreadsheet-data.ts "Бюджети" --formulas');
  console.log('');
  console.log('Options:');
  console.log('  --formulas  Show formulas instead of formatted values');
}

interface ParsedArgs {
  sheetName: string;
  showFormulas: boolean;
}

function parseArgs(args: string[]): ParsedArgs | null {
  if (args.length === 0 || args.length > 2) {
    return null;
  }

  const sheetName = args[0];
  if (!sheetName || sheetName.startsWith('--')) {
    return null;
  }

  const showFormulas = args.includes('--formulas');

  // Check for invalid flags
  const invalidArg = args.slice(1).find((arg) => arg.startsWith('--') && arg !== '--formulas');
  if (invalidArg) {
    console.error(`Error: Unknown option "${invalidArg}"`);
    return null;
  }

  return { sheetName, showFormulas };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsedArgs = parseArgs(args);

  if (!parsedArgs) {
    console.error('Error: Invalid arguments.');
    printUsage();
    process.exit(1);
  }

  const { sheetName, showFormulas } = parsedArgs;
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    const readOptions: ReadOptions = {
      valueRenderOption: showFormulas ? 'FORMULA' : 'FORMATTED_VALUE',
    };

    const allRows = await client.readAllRows(spreadsheetId, sheetName, readOptions);

    if (allRows.length === 0) {
      console.log(JSON.stringify({ headers: [], rows: [] }, null, 2));
      return;
    }

    const headers = allRows[0]?.map((cell) => (cell !== null ? String(cell) : '')) ?? [];
    const dataRows = allRows.slice(1);

    const result = {
      headers,
      rows: dataRows,
      totalRows: dataRows.length,
      mode: showFormulas ? 'formulas' : 'values',
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error reading data: ${error.message}`);
    } else {
      console.error('Error reading data: Unknown error');
    }
    process.exit(1);
  }
}

main();
