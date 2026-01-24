#!/usr/bin/env bun
/**
 * Fetch exchange rates from NBU (National Bank of Ukraine) API and populate the spreadsheet.
 *
 * Usage: bun scripts/fetch-exchange-rates.ts [--months <n>]
 *
 * Options:
 *   --months <n>  Number of months to fetch (default: 6)
 *
 * Example:
 *   bun scripts/fetch-exchange-rates.ts
 *   bun scripts/fetch-exchange-rates.ts --months 12
 *
 * This script:
 * 1. Creates "Курси валют" sheet if it doesn't exist
 * 2. Fetches USD and EUR rates from NBU API for specified months (one rate per month, last day)
 * 3. Writes rates to the spreadsheet
 *
 * NBU API Documentation:
 * - Base URL: https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange
 * - Parameters: ?json&valcode=USD&date=YYYYMMDD
 */

import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';

const SHEET_NAME = 'Курси валют';
const HEADERS = ['Дата', 'Валюта', 'Курс'];
const CURRENCIES = ['USD', 'EUR'];
const NBU_API_BASE_URL =
  'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';

interface NbuExchangeRate {
  r030: number;
  txt: string;
  rate: number;
  cc: string;
  exchangedate: string;
}

interface ExchangeRateRow {
  date: string;
  currency: string;
  rate: number;
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Error: Environment variable ${name} is required but not set.`,
    );
    process.exit(1);
  }
  return value;
}

function printUsage(): void {
  console.log('Usage: bun scripts/fetch-exchange-rates.ts [--months <n>]');
  console.log('');
  console.log('Options:');
  console.log('  --months <n>  Number of months to fetch (default: 6)');
  console.log('');
  console.log('Example:');
  console.log('  bun scripts/fetch-exchange-rates.ts');
  console.log('  bun scripts/fetch-exchange-rates.ts --months 12');
}

function parseArgs(args: string[]): { months: number } | null {
  let months = 6;

  for (let argIndex = 0; argIndex < args.length; argIndex++) {
    const arg = args[argIndex];
    if (arg === '--months') {
      const nextArg = args[argIndex + 1];
      if (!nextArg) {
        console.error('Error: --months requires a value');
        return null;
      }
      const parsed = Number.parseInt(nextArg, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        console.error('Error: --months must be a positive integer');
        return null;
      }
      months = parsed;
      argIndex++;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg?.startsWith('--')) {
      console.error(`Error: Unknown option "${arg}"`);
      return null;
    }
  }

  return { months };
}

/**
 * Get the last day of each month for the past N months
 */
function getMonthlyDates(monthsBack: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  for (let monthOffset = 0; monthOffset < monthsBack; monthOffset++) {
    const targetMonth = new Date(
      now.getFullYear(),
      now.getMonth() - monthOffset,
      1,
    );

    // Get last day of the month
    const lastDayOfMonth = new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth() + 1,
      0,
    );

    // If it's the current month, use today's date instead of the last day
    if (monthOffset === 0 && lastDayOfMonth > now) {
      dates.push(now);
    } else {
      dates.push(lastDayOfMonth);
    }
  }

  return dates;
}

/**
 * Format date for NBU API (YYYYMMDD)
 */
function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format date for spreadsheet display (DD.MM.YYYY)
 */
function formatDateForDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}.${month}.${year}`;
}

/**
 * Fetch exchange rate from NBU API for a specific currency and date
 */
async function fetchNbuRate(
  currency: string,
  date: Date,
): Promise<NbuExchangeRate | null> {
  const dateStr = formatDateForApi(date);
  const url = `${NBU_API_BASE_URL}?json&valcode=${currency}&date=${dateStr}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Failed to fetch ${currency} rate for ${dateStr}: HTTP ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as NbuExchangeRate[];
    if (!Array.isArray(data) || data.length === 0) {
      console.error(`No data returned for ${currency} on ${dateStr}`);
      return null;
    }

    return data[0] ?? null;
  } catch (error) {
    console.error(
      `Error fetching ${currency} rate for ${dateStr}:`,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}

/**
 * Fetch all exchange rates for the specified period
 */
async function fetchAllRates(monthsBack: number): Promise<ExchangeRateRow[]> {
  const dates = getMonthlyDates(monthsBack);
  const rates: ExchangeRateRow[] = [];

  console.log(`Fetching exchange rates for ${monthsBack} months...`);

  for (const date of dates) {
    for (const currency of CURRENCIES) {
      const rate = await fetchNbuRate(currency, date);
      if (rate) {
        rates.push({
          date: formatDateForDisplay(date),
          currency: rate.cc,
          rate: rate.rate,
        });
        console.log(
          `  ${formatDateForDisplay(date)} ${rate.cc}: ${rate.rate}`,
        );
      }
      // Small delay to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return rates;
}

/**
 * Ensure the sheet exists with proper headers
 */
async function ensureSheetExists(
  client: SpreadsheetsClient,
  spreadsheetId: string,
): Promise<void> {
  const metadata = await client.getMetadata(spreadsheetId);
  const existingSheet = metadata.sheets.find(
    (sheet) => sheet.title === SHEET_NAME,
  );

  if (existingSheet) {
    console.log(`Sheet "${SHEET_NAME}" already exists.`);
    return;
  }

  console.log(`Creating sheet "${SHEET_NAME}"...`);
  const result = await client.addSheet(spreadsheetId, SHEET_NAME);
  console.log(`Created sheet "${SHEET_NAME}" with ID ${result.sheetId}.`);

  // Write headers
  const range = `'${SHEET_NAME}'!A1`;
  await client.writeRange(spreadsheetId, range, [HEADERS]);
  console.log(`Added headers: ${JSON.stringify(HEADERS)}`);
}

/**
 * Write exchange rates to the spreadsheet
 */
async function writeRatesToSheet(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  rates: ExchangeRateRow[],
): Promise<void> {
  if (rates.length === 0) {
    console.log('No rates to write.');
    return;
  }

  // Clear existing data (except headers)
  const clearRange = `'${SHEET_NAME}'!A2:C`;
  await client.clearRange(spreadsheetId, clearRange);

  // Sort rates by date (newest first), then by currency
  const sortedRates = [...rates].sort((rateA, rateB) => {
    const dateComparison = compareDates(rateB.date, rateA.date);
    if (dateComparison !== 0) return dateComparison;
    return rateA.currency.localeCompare(rateB.currency);
  });

  // Convert to rows
  const rows = sortedRates.map((rate) => [rate.date, rate.currency, rate.rate]);

  // Write to sheet
  const writeRange = `'${SHEET_NAME}'!A2`;
  await client.writeRange(spreadsheetId, writeRange, rows);
  console.log(`Wrote ${rows.length} exchange rate entries to the sheet.`);
}

/**
 * Compare two dates in DD.MM.YYYY format
 */
function compareDates(dateA: string, dateB: string): number {
  const [dayA, monthA, yearA] = dateA.split('.').map(Number);
  const [dayB, monthB, yearB] = dateB.split('.').map(Number);

  if (yearA !== yearB) return (yearA ?? 0) - (yearB ?? 0);
  if (monthA !== monthB) return (monthA ?? 0) - (monthB ?? 0);
  return (dayA ?? 0) - (dayB ?? 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsedArgs = parseArgs(args);

  if (!parsedArgs) {
    printUsage();
    process.exit(1);
  }

  const { months } = parsedArgs;
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  try {
    // Ensure sheet exists
    await ensureSheetExists(client, spreadsheetId);

    // Fetch rates
    const rates = await fetchAllRates(months);

    // Write to sheet
    await writeRatesToSheet(client, spreadsheetId, rates);

    console.log('Done!');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Error: Unknown error');
    }
    process.exit(1);
  }
}

main();
