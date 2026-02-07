#!/usr/bin/env bun
/**
 * Export all relevant sheets from the Google Spreadsheet to JSON files.
 * Usage: bun scripts/export-spreadsheet-data.ts
 *
 * Exports data to recovery/spreadsheet-data/ directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';
import type { CellValue } from '../src/modules/spreadsheet/types.ts';

interface SheetConfig {
  sheetName: string;
  outputFile: string;
  headers: string[];
}

const SHEETS_CONFIG: SheetConfig[] = [
  {
    sheetName: 'Рахунки',
    outputFile: 'accounts.json',
    headers: [
      'Назва',
      'Тип',
      'Валюта',
      'Залишок',
      'Роль',
      'ID (зовнішній)',
      'IBAN',
      'Назва (зовнішня)',
      'Кредитний ліміт',
      'Банк',
      'Остання синхронізація',
      'ID',
    ],
  },
  {
    sheetName: 'Категорії',
    outputFile: 'categories.json',
    headers: ['Назва', 'Батьківська категорія', 'Статус', 'ID'],
  },
  {
    sheetName: 'Бюджети',
    outputFile: 'budgets.json',
    headers: ['Назва', 'Тип', 'Сума', 'Валюта', 'Дата початку', 'Дата закінчення', 'Переносити залишок', 'ID'],
  },
  {
    sheetName: 'Виділені кошти',
    outputFile: 'allocations.json',
    headers: ['ID', 'Бюджет', 'Сума', 'Період', 'Дата', 'Примітки'],
  },
  {
    sheetName: 'Транзакції',
    outputFile: 'transactions.json',
    headers: [], // Will use headers from the sheet itself
  },
  {
    sheetName: 'Правила категорій',
    outputFile: 'categorization-rules.json',
    headers: ['Правило'],
  },
  {
    sheetName: 'Правила бюджетів',
    outputFile: 'budgetization-rules.json',
    headers: ['Правило'],
  },
];

const OUTPUT_DIR = path.join(import.meta.dir, '..', 'recovery', 'spreadsheet-data');

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function rowToObject(row: CellValue[], headers: string[]): Record<string, CellValue> {
  const obj: Record<string, CellValue> = {};
  for (let colIndex = 0; colIndex < headers.length; colIndex++) {
    const header = headers[colIndex];
    if (header) {
      obj[header] = row[colIndex] ?? null;
    }
  }
  return obj;
}

async function exportSheet(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  config: SheetConfig
): Promise<void> {
  console.log(`Exporting "${config.sheetName}"...`);

  try {
    const allRows = await client.readAllRows(spreadsheetId, config.sheetName);

    if (allRows.length === 0) {
      console.log(`  No data found in "${config.sheetName}"`);
      fs.writeFileSync(path.join(OUTPUT_DIR, config.outputFile), JSON.stringify([], null, 2));
      return;
    }

    // Use headers from config, or from the sheet if not specified
    const sheetHeaders = allRows[0]?.map((cell) => (cell !== null ? String(cell) : '')) ?? [];
    const headers = config.headers.length > 0 ? config.headers : sheetHeaders;

    // Skip header row
    const dataRows = allRows.slice(1);

    // Convert rows to objects
    const objects = dataRows.map((row) => rowToObject(row, headers));

    // Write to file
    const outputPath = path.join(OUTPUT_DIR, config.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(objects, null, 2));

    console.log(`  Exported ${objects.length} rows to ${config.outputFile}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`  Error exporting "${config.sheetName}": ${error.message}`);
    } else {
      console.error(`  Error exporting "${config.sheetName}": Unknown error`);
    }
  }
}

async function main(): Promise<void> {
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  console.log('Starting spreadsheet data export...\n');

  for (const config of SHEETS_CONFIG) {
    await exportSheet(client, spreadsheetId, config);
  }

  console.log('\nExport complete!');
  console.log(`Files saved to: ${OUTPUT_DIR}`);
}

main();
