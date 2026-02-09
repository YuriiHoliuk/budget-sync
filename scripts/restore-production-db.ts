/**
 * Restore Production Database
 *
 * Imports data from Monobank API responses (recovery/monobank-data/) and
 * spreadsheet exports (recovery/spreadsheet-data/) into production database.
 *
 * Data sources:
 *   - Transactions & balances: Monobank API (source of truth)
 *   - Categories, budgets, allocations: Spreadsheet exports
 *   - Category/budget assignments: Spreadsheet (matched by external_id)
 *
 * Status logic:
 *   - Transactions before/including dV4uVoAFuybjCm6fLg → 'verified'
 *   - Transactions after: use spreadsheet status if categorized, else 'pending'
 *
 * Usage:
 *   DATABASE_URL=<production-url> bun run scripts/restore-production-db.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  allocations,
  budgets,
  categories,
} from '../src/modules/database/schema/index.ts';

// --- Config ---

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const CUTOFF_EXTERNAL_ID = 'dV4uVoAFuybjCm6fLg';

// Account external IDs
const IRON_CARD = 'tZ7TK0SXUSTPPPdVpgHf0g';
const WHITE_CARD = 'kM9m2i5TaZuzI_Ft8prkbA';

// Initial balances (in kopecks)
const INITIAL_BALANCES: Record<string, number> = {
  [IRON_CARD]: 52200, // 522 UAH
  [WHITE_CARD]: 132600, // 1326 UAH
};

// Currency code mapping (ISO 4217 numeric → 3-letter)
const CURRENCY_MAP: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  985: 'PLN',
};

// --- Types ---

interface MonobankStatementItem {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

interface SpreadsheetTransaction {
  'Категорія': string;
  'Бюджет': string;
  'ID (зовнішній)': string | null;
  'Статус': string | null;
  'Причина категорії': string | null;
  'Причина бюджету': string | null;
}

interface SpreadsheetCategory {
  'Назва': string;
  'Батьківська категорія': string;
  'Статус': string;
  'ID': string | null;
}

interface SpreadsheetBudget {
  'Назва': string;
  'Тип': string;
  'Сума': string;
  'Валюта': string;
  'Дата початку': string;
  'Дата закінчення': string;
  'Переносити залишок': string;
  'ID': string;
}

interface SpreadsheetAllocation {
  'Бюджет': string;
  'Сума': string;
  'Період': string;
  'Дата': string;
  'Примітки': string | null;
}

interface SpreadsheetEnrichment {
  categoryName: string | null;
  budgetName: string | null;
  status: string | null;
  categoryReason: string | null;
  budgetReason: string | null;
}

// --- Helpers ---

function parseAmountToKopecks(value: string | null | undefined): number {
  if (!value || value === '') return 0;
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

function parseDate(value: string | null | undefined): string | null {
  if (!value || value === '') return null;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0] ?? null;
  } catch {
    return null;
  }
}

function parseDateDDMMYYYY(value: string | null | undefined): string | null {
  if (!value || value === '') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
}

function currencyFromCode(code: number): string {
  return CURRENCY_MAP[code] || 'UAH';
}

// --- DB Setup ---

const client = postgres(DATABASE_URL);
const db = drizzle(client);

// --- Data Loading ---

async function loadJson<T>(path: string): Promise<T> {
  const file = Bun.file(path);
  return await file.json();
}

function loadMonobankTransactions(
  files: string[],
  accountExternalId: string,
  accountCurrency: string,
): Array<{
  item: MonobankStatementItem;
  accountExternalId: string;
  accountCurrency: string;
}> {
  const seen = new Set<string>();
  const result: Array<{
    item: MonobankStatementItem;
    accountExternalId: string;
    accountCurrency: string;
  }> = [];

  for (const file of files) {
    const data = JSON.parse(
      require('fs').readFileSync(file, 'utf8'),
    ) as MonobankStatementItem[];

    for (const item of data) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push({ item, accountExternalId, accountCurrency });
    }
  }

  return result;
}

function buildSpreadsheetLookup(
  transactions: SpreadsheetTransaction[],
): Map<string, SpreadsheetEnrichment> {
  const map = new Map<string, SpreadsheetEnrichment>();

  for (const tx of transactions) {
    const externalId = tx['ID (зовнішній)'];
    if (!externalId) continue;

    map.set(externalId, {
      categoryName: tx['Категорія'] || null,
      budgetName: tx['Бюджет'] || null,
      status: tx['Статус'] || null,
      categoryReason: tx['Причина категорії'] || null,
      budgetReason: tx['Причина бюджету'] || null,
    });
  }

  return map;
}

// --- Import Functions ---

async function truncateData() {
  console.log('\n1. Truncating transactions, categories, budgets, allocations...');
  await db.execute(sql`
    TRUNCATE TABLE
      transaction_link_members,
      transaction_links,
      transactions,
      allocations,
      budgets,
      categories
    RESTART IDENTITY CASCADE
  `);
  console.log('   Done.');
}

async function importCategories(): Promise<Map<string, number>> {
  console.log('\n2. Importing categories from spreadsheet...');

  const data = await loadJson<SpreadsheetCategory[]>(
    './recovery/spreadsheet-data/categories.json',
  );

  const categoryMap = new Map<string, number>(); // name → id
  const parentNameMap = new Map<number, string>(); // id → parent name

  // Filter categories that have IDs (skip the last "suggested" one without ID)
  const validCategories = data.filter((cat) => cat['ID'] !== null);

  // First pass: insert without parent_id
  for (const cat of validCategories) {
    const id = parseInt(cat['ID']!);
    const name = cat['Назва'];
    const status = cat['Статус'] || 'active';

    await db.insert(categories).values({ id, name, status });
    categoryMap.set(name, id);

    if (cat['Батьківська категорія']) {
      parentNameMap.set(id, cat['Батьківська категорія']);
    }
  }

  // Second pass: set parent_id
  for (const [id, parentName] of parentNameMap) {
    const parentId = categoryMap.get(parentName);
    if (parentId) {
      await db.execute(
        sql`UPDATE categories SET parent_id = ${parentId} WHERE id = ${id}`,
      );
    } else {
      console.log(`   Warning: Parent "${parentName}" not found for category ${id}`);
    }
  }

  // Update sequence
  const maxId = Math.max(...validCategories.map((c) => parseInt(c['ID']!)));
  await db.execute(sql`SELECT setval('categories_id_seq', ${maxId})`);

  console.log(`   Imported ${validCategories.length} categories.`);
  return categoryMap;
}

async function importBudgets(): Promise<Map<string, number>> {
  console.log('\n3. Importing budgets from spreadsheet...');

  const data = await loadJson<SpreadsheetBudget[]>(
    './recovery/spreadsheet-data/budgets.json',
  );

  const budgetMap = new Map<string, number>(); // name → id
  const seenIds = new Set<number>();

  for (const budget of data) {
    if (!budget['ID']) continue;

    const id = parseInt(budget['ID']);
    // Skip duplicate IDs (there's a duplicate ID 21 "Оренда" in the data)
    if (seenIds.has(id)) {
      console.log(`   Warning: Skipping duplicate budget ID ${id} ("${budget['Назва']}")`);
      continue;
    }
    seenIds.add(id);

    const name = budget['Назва'];
    const targetAmount = parseAmountToKopecks(budget['Сума']);
    const startDate = parseDate(budget['Дата початку']);
    const endDate = parseDate(budget['Дата закінчення']);

    await db.insert(budgets).values({
      id,
      name,
      type: 'spending',
      currency: budget['Валюта'],
      targetAmount,
      startDate,
      endDate,
    });

    budgetMap.set(name, id);
  }

  // Update sequence
  const maxId = Math.max(...seenIds);
  await db.execute(sql`SELECT setval('budgets_id_seq', ${maxId})`);

  console.log(`   Imported ${seenIds.size} budgets.`);
  return budgetMap;
}

async function importAllocations(
  budgetMap: Map<string, number>,
): Promise<number> {
  console.log('\n4. Importing allocations from spreadsheet...');

  const data = await loadJson<SpreadsheetAllocation[]>(
    './recovery/spreadsheet-data/allocations.json',
  );

  let count = 0;

  for (const alloc of data) {
    const budgetName = alloc['Бюджет'];
    const budgetId = budgetMap.get(budgetName);

    if (!budgetId) {
      console.log(`   Warning: Budget "${budgetName}" not found, skipping allocation`);
      continue;
    }

    const amount = parseAmountToKopecks(alloc['Сума']);
    const period = alloc['Період'];
    const date = parseDateDDMMYYYY(alloc['Дата']) || `${period}-01`;

    await db.insert(allocations).values({
      budgetId,
      amount,
      period,
      date,
      notes: alloc['Примітки'] || null,
    });

    count++;
  }

  console.log(`   Imported ${count} allocations.`);
  return count;
}

async function importTransactions(
  categoryMap: Map<string, number>,
  budgetMap: Map<string, number>,
  accountIdMap: Map<string, number>,
): Promise<{ total: number; verified: number; categorized: number; pending: number }> {
  console.log('\n5. Importing transactions from Monobank data...');

  // Load spreadsheet data for enrichment
  const spreadsheetTxs = await loadJson<SpreadsheetTransaction[]>(
    './recovery/spreadsheet-data/transactions.json',
  );
  const enrichmentMap = buildSpreadsheetLookup(spreadsheetTxs);

  // Load Monobank transactions
  const allTransactions = [
    ...loadMonobankTransactions(
      [
        './recovery/monobank-data/iron-jan.json',
        './recovery/monobank-data/iron-feb.json',
      ],
      IRON_CARD,
      'UAH',
    ),
    ...loadMonobankTransactions(
      [
        './recovery/monobank-data/white-jan.json',
        './recovery/monobank-data/white-feb.json',
      ],
      WHITE_CARD,
      'UAH',
    ),
  ];

  // Sort by time ascending
  allTransactions.sort((a, b) => a.item.time - b.item.time);

  console.log(`   Loaded ${allTransactions.length} transactions from Monobank`);
  console.log(`   Spreadsheet enrichment map: ${enrichmentMap.size} entries`);

  // Find cutoff transaction time
  const cutoffTx = allTransactions.find(
    (t) => t.item.id === CUTOFF_EXTERNAL_ID,
  );
  if (!cutoffTx) {
    console.error(`   ERROR: Cutoff transaction ${CUTOFF_EXTERNAL_ID} not found in Monobank data!`);
    process.exit(1);
  }
  const cutoffTime = cutoffTx.item.time;
  console.log(`   Cutoff transaction: ${CUTOFF_EXTERNAL_ID} at ${new Date(cutoffTime * 1000).toISOString()}`);

  let stats = { total: 0, verified: 0, categorized: 0, pending: 0 };

  for (const { item, accountExternalId, accountCurrency } of allTransactions) {
    const accountId = accountIdMap.get(accountExternalId) || null;
    const enrichment = enrichmentMap.get(item.id);

    // Resolve category and budget from spreadsheet
    const categoryId =
      enrichment?.categoryName
        ? categoryMap.get(enrichment.categoryName) || null
        : null;
    const budgetId =
      enrichment?.budgetName
        ? budgetMap.get(enrichment.budgetName) || null
        : null;

    // Determine status
    let categorizationStatus: string;
    if (item.time <= cutoffTime) {
      categorizationStatus = 'verified';
      stats.verified++;
    } else if (enrichment?.status === 'categorized' && categoryId) {
      categorizationStatus = 'categorized';
      stats.categorized++;
    } else {
      categorizationStatus = 'pending';
      stats.pending++;
    }

    const type = item.amount < 0 ? 'debit' : 'credit';
    const date = new Date(item.time * 1000).toISOString();
    const operationCurrency = currencyFromCode(item.currencyCode);

    await db.execute(sql`
      INSERT INTO transactions (
        external_id, date, amount, currency, type,
        account_id, account_external_id,
        category_id, budget_id,
        categorization_status, category_reason, budget_reason,
        mcc, original_mcc,
        bank_description, counterparty, counterparty_iban, counter_edrpou,
        balance_after, operation_amount, operation_currency,
        cashback, commission, hold,
        receipt_id, invoice_id
      ) VALUES (
        ${item.id},
        ${date},
        ${item.amount},
        ${accountCurrency},
        ${type},
        ${accountId},
        ${accountExternalId},
        ${categoryId},
        ${budgetId},
        ${categorizationStatus},
        ${enrichment?.categoryReason || null},
        ${enrichment?.budgetReason || null},
        ${item.mcc},
        ${item.originalMcc !== item.mcc ? item.originalMcc : null},
        ${item.description},
        ${item.counterName || null},
        ${item.counterIban || null},
        ${item.counterEdrpou || null},
        ${item.balance},
        ${item.operationAmount},
        ${operationCurrency},
        ${item.cashbackAmount || 0},
        ${item.commissionRate || 0},
        ${item.hold},
        ${item.receiptId || null},
        ${item.invoiceId || null}
      )
    `);

    stats.total++;
  }

  console.log(`   Imported ${stats.total} transactions.`);
  console.log(`     Verified: ${stats.verified}`);
  console.log(`     Categorized: ${stats.categorized}`);
  console.log(`     Pending: ${stats.pending}`);

  return stats;
}

async function updateAccountBalances(
  accountIdMap: Map<string, number>,
): Promise<void> {
  console.log('\n6. Updating account balances...');

  for (const [externalId, accountId] of accountIdMap) {
    // Get the last transaction for this account (by date desc)
    const lastTx = await db.execute(sql`
      SELECT balance_after, date
      FROM transactions
      WHERE account_external_id = ${externalId}
      ORDER BY date DESC
      LIMIT 1
    `);

    if (lastTx.length > 0) {
      const balance = lastTx[0]!.balance_after;
      const lastDate = lastTx[0]!.date;
      const initialBalance = INITIAL_BALANCES[externalId] ?? null;

      await db.execute(sql`
        UPDATE accounts
        SET balance = ${balance},
            initial_balance = ${initialBalance},
            last_sync_time = ${lastDate}
        WHERE id = ${accountId}
      `);

      console.log(`   Account ${accountId} (${externalId}): balance=${balance}, initial=${initialBalance}`);
    }
  }

  // Also set initial_balance for accounts without transactions
  for (const [externalId, initialBalance] of Object.entries(INITIAL_BALANCES)) {
    if (!accountIdMap.has(externalId)) continue;
    const accountId = accountIdMap.get(externalId)!;

    await db.execute(sql`
      UPDATE accounts
      SET initial_balance = COALESCE(initial_balance, ${initialBalance})
      WHERE id = ${accountId}
    `);
  }

  console.log('   Done.');
}

// --- Main ---

async function main() {
  console.log('='.repeat(60));
  console.log('Restore Production Database');
  console.log('='.repeat(60));
  console.log(`\nDatabase: ${DATABASE_URL?.substring(0, 50)}...`);

  // Check that Monobank data exists
  const requiredFiles = [
    './recovery/monobank-data/iron-jan.json',
    './recovery/monobank-data/iron-feb.json',
    './recovery/monobank-data/white-jan.json',
    './recovery/monobank-data/white-feb.json',
  ];
  for (const file of requiredFiles) {
    if (!require('fs').existsSync(file)) {
      console.error(`ERROR: Required file not found: ${file}`);
      console.error('Run fetch-monobank-recovery.ts first.');
      process.exit(1);
    }
  }

  // Load account ID mapping from DB
  const accountRows = await db.execute(
    sql`SELECT id, external_id FROM accounts`,
  );
  const accountIdMap = new Map<string, number>();
  for (const row of accountRows) {
    accountIdMap.set(row.external_id as string, row.id as number);
  }
  console.log(`\nFound ${accountIdMap.size} accounts in DB.`);

  try {
    // Step 1: Truncate
    await truncateData();

    // Step 2: Import categories
    const categoryMap = await importCategories();

    // Step 3: Import budgets
    const budgetMap = await importBudgets();

    // Step 4: Import allocations
    const allocationCount = await importAllocations(budgetMap);

    // Step 5: Import transactions from Monobank with spreadsheet enrichment
    const txStats = await importTransactions(categoryMap, budgetMap, accountIdMap);

    // Step 6: Update account balances
    await updateAccountBalances(accountIdMap);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('RESTORE COMPLETE');
    console.log('='.repeat(60));
    console.log(`
Summary:
  - Categories:    ${categoryMap.size}
  - Budgets:       ${budgetMap.size}
  - Allocations:   ${allocationCount}
  - Transactions:  ${txStats.total}
    - Verified:    ${txStats.verified}
    - Categorized: ${txStats.categorized}
    - Pending:     ${txStats.pending}
`);
  } catch (error) {
    console.error('\nRestore failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
