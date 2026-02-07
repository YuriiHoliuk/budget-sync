/**
 * Import Spreadsheet Data to Production Database
 *
 * Imports data from exported spreadsheet JSON files into the production Neon database.
 * This script is designed for disaster recovery - restoring data from spreadsheet exports.
 *
 * Usage:
 *   DATABASE_URL=<production-url> bun run scripts/import-spreadsheet-to-db.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  allocations,
  budgetizationRules,
  budgets,
  categories,
  categorizationRules,
} from '../src/modules/database/schema/index.ts';

// Data paths
const RECOVERY_DIR = './recovery/spreadsheet-data';
const CURRENT_STATE_PATH = './recovery/current-db-state.json';

// Types for spreadsheet data
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
  'ID': string;
  'Бюджет': string;
  'Сума': string;
  'Період': string;
  'Дата': string;
  'Примітки': string | null;
}

interface SpreadsheetTransaction {
  'Час human-readable': string;
  'Сума': string;
  'Валюта': string;
  'Категорія': string;
  'Бюджет': string;
  'Опис з банку': string;
  'Одержувач': string;
  'Рахунок': string;
  'MCC': string;
  'Категорія з банку': string;
  'Мітки': string;
  'Примітки': string;
  'Час': string;
  'ID (зовнішній)': string | null;
  'Рахунок ID': string | null;
  'Залишок після': string;
  'Сума операції': string;
  'Валюта операції': string;
  'IBAN одержувача': string;
  'Холд': string;
  'Кешбек': string;
  'Комісія': string;
  'MCC (оригінал)': string;
  'Чек ID': string;
  'Інвойс ID': string;
  'ЄДРПОУ одержувача': string;
  'Статус': string | null;
  'Причина категорії': string | null;
  'Причина бюджету': string | null;
  'ID': string | null;
}

interface SpreadsheetRule {
  'Правило': string;
}

interface CurrentDbState {
  accounts: Array<{
    id: number;
    external_id: string;
    name: string;
    type: string;
    currency: string;
    balance: string;
    role: string;
    credit_limit: string;
    iban: string;
    bank: string;
    source: string;
    is_archived: boolean;
  }>;
  transactions: Array<{
    id: number;
    external_id: string;
    date: string;
    amount: string;
    currency: string;
    type: string;
    account_external_id: string;
    category_id?: number;
    mcc: number;
    bank_description: string;
    balance_after: string;
    operation_amount: string;
    operation_currency: string;
    hold: boolean;
    receipt_id: string;
  }>;
}

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

// Helper to parse Ukrainian-style numbers (comma as decimal separator)
function parseAmount(value: string | null | undefined): number {
  if (!value || value === '') return 0;
  // Remove spaces and replace comma with dot
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

// Helper to parse amount that is already in kopecks (integer values like "-40")
function parseKopecks(value: string | null | undefined): number {
  if (!value || value === '') return 0;
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// Helper to parse balance which may have comma as decimal separator
function parseBalance(value: string | null | undefined): number {
  if (!value || value === '') return 0;
  // Format: "200483,47" means 200483.47 UAH = 20048347 kopecks
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
  // Format: "01.01.2026"
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
}

async function loadJson<T>(filename: string): Promise<T> {
  const file = Bun.file(`${RECOVERY_DIR}/${filename}`);
  return await file.json();
}

async function loadCurrentState(): Promise<CurrentDbState> {
  const file = Bun.file(CURRENT_STATE_PATH);
  return await file.json();
}

async function truncateTables() {
  console.log('\n1. Truncating all tables...');
  await db.execute(sql`
    TRUNCATE TABLE
      transaction_link_members,
      transaction_links,
      transactions,
      allocations,
      budgets,
      categories,
      accounts,
      categorization_rules,
      budgetization_rules
    RESTART IDENTITY CASCADE
  `);
  console.log('   Done.');
}

async function importAccounts(currentState: CurrentDbState): Promise<Map<string, number>> {
  console.log('\n2. Importing accounts from current DB state...');

  const accountMap = new Map<string, number>(); // external_id -> id

  for (const acc of currentState.accounts) {
    // Determine initial_balance
    let initialBalance: number;
    if (acc.name.includes('*4618')) {
      // White Card: initial 1326 UAH = 132600 kopecks
      initialBalance = 132600;
    } else if (acc.name.includes('*9727')) {
      // Iron Card: initial 522 UAH = 52200 kopecks
      initialBalance = 52200;
    } else {
      // Others: use current balance as initial
      initialBalance = parseInt(acc.balance);
    }

    await db.execute(sql`
      INSERT INTO accounts (id, external_id, name, type, currency, balance, initial_balance, role, credit_limit, iban, bank, source, is_archived)
      VALUES (
        ${acc.id},
        ${acc.external_id},
        ${acc.name},
        ${acc.type},
        ${acc.currency},
        ${parseInt(acc.balance)},
        ${initialBalance},
        ${acc.role},
        ${parseInt(acc.credit_limit)},
        ${acc.iban},
        ${acc.bank},
        ${acc.source},
        ${acc.is_archived}
      )
    `);

    accountMap.set(acc.external_id, acc.id);
    console.log(`   Account ${acc.id}: ${acc.name} (initial_balance: ${initialBalance / 100})`);
  }

  // Update sequence
  const maxId = Math.max(...currentState.accounts.map(a => a.id));
  await db.execute(sql`SELECT setval('accounts_id_seq', ${maxId})`);

  console.log(`   Imported ${currentState.accounts.length} accounts.`);
  return accountMap;
}

async function importCategories(): Promise<Map<string, number>> {
  console.log('\n3. Importing categories...');

  const data = await loadJson<SpreadsheetCategory[]>('categories.json');
  const categoryMap = new Map<string, number>(); // name -> id
  const parentNameMap = new Map<number, string>(); // id -> parent name

  // First pass: insert all categories without parent_id
  const validCategories = data.filter(cat => cat['ID'] !== null);

  for (const cat of validCategories) {
    const id = parseInt(cat['ID']!);
    const name = cat['Назва'];
    const status = cat['Статус'] || 'active';

    await db.insert(categories).values({
      id,
      name,
      status,
    });

    categoryMap.set(name, id);
    if (cat['Батьківська категорія']) {
      parentNameMap.set(id, cat['Батьківська категорія']);
    }
  }

  // Second pass: update parent_id based on name lookup
  for (const [id, parentName] of parentNameMap) {
    const parentId = categoryMap.get(parentName);
    if (parentId) {
      await db.execute(sql`
        UPDATE categories SET parent_id = ${parentId} WHERE id = ${id}
      `);
    }
  }

  // Update sequence
  const maxId = Math.max(...validCategories.map(c => parseInt(c['ID']!)));
  await db.execute(sql`SELECT setval('categories_id_seq', ${maxId})`);

  console.log(`   Imported ${validCategories.length} categories.`);
  return categoryMap;
}

async function importBudgets(): Promise<Map<string, number>> {
  console.log('\n4. Importing budgets...');

  const data = await loadJson<SpreadsheetBudget[]>('budgets.json');
  const budgetMap = new Map<string, number>(); // name -> id
  const seenIds = new Set<number>();

  for (const budget of data) {
    if (!budget['ID']) continue;

    const id = parseInt(budget['ID']);
    // Skip duplicates (there's a duplicate ID 21 in the data)
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = budget['Назва'];
    const type = budget['Тип'] === 'Monthly' ? 'spending' : 'spending';
    const targetAmount = parseAmount(budget['Сума']); // Already in UAH, convert to kopecks
    const startDate = parseDate(budget['Дата початку']);
    const endDate = parseDate(budget['Дата закінчення']);

    await db.insert(budgets).values({
      id,
      name,
      type,
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

async function importAllocations(budgetMap: Map<string, number>): Promise<number> {
  console.log('\n5. Importing allocations...');

  const data = await loadJson<SpreadsheetAllocation[]>('allocations.json');
  let count = 0;

  for (const alloc of data) {
    const budgetName = alloc['Бюджет'];
    const budgetId = budgetMap.get(budgetName);

    if (!budgetId) {
      console.log(`   Warning: Budget "${budgetName}" not found, skipping allocation`);
      continue;
    }

    const amount = parseAmount(alloc['Сума']);
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
  accountMap: Map<string, number>,
): Promise<number> {
  console.log('\n6. Importing transactions from spreadsheet...');

  const data = await loadJson<SpreadsheetTransaction[]>('transactions.json');
  let count = 0;
  let maxId = 0;

  // Filter transactions with valid IDs
  const validTransactions = data.filter(tx => tx['ID'] !== null);

  for (const tx of validTransactions) {
    const id = parseInt(tx['ID']!);
    maxId = Math.max(maxId, id);

    const externalId = tx['ID (зовнішній)'] || null;
    const date = new Date(tx['Час']).toISOString();

    // Parse amount - "Сума операції" is in kopecks if it looks like "-40"
    // "Сума" is in UAH with comma as decimal separator like "698,95"
    let amount: number;
    if (tx['Сума операції'] && tx['Сума операції'] !== '') {
      // Сума операції is already in kopecks as integer
      amount = parseKopecks(tx['Сума операції']);
    } else {
      // Fallback to Сума (in UAH, need to convert)
      const sumaInUah = parseAmount(tx['Сума']);
      // Make it negative for expenses (most transactions are expenses)
      amount = -sumaInUah;
    }

    const type = amount < 0 ? 'debit' : 'credit';

    // Resolve category
    const categoryName = tx['Категорія'];
    const categoryId = categoryName ? categoryMap.get(categoryName) || null : null;

    // Resolve budget
    const budgetName = tx['Бюджет'];
    const budgetId = budgetName ? budgetMap.get(budgetName) || null : null;

    // Resolve account
    const accountExternalId = tx['Рахунок ID'] || null;
    const accountId = accountExternalId ? accountMap.get(accountExternalId) || null : null;

    // Parse balance after (format: "200483,47" means 200483.47 UAH)
    const balanceAfter = parseBalance(tx['Залишок після']);

    await db.execute(sql`
      INSERT INTO transactions (
        id, external_id, date, amount, currency, type,
        account_id, account_external_id, category_id, budget_id,
        categorization_status, category_reason, budget_reason,
        mcc, bank_description, counterparty, counterparty_iban,
        balance_after, operation_amount, operation_currency,
        cashback, commission, hold, receipt_id, invoice_id, notes
      ) VALUES (
        ${id},
        ${externalId},
        ${date},
        ${amount},
        ${tx['Валюта'] || 'UAH'},
        ${type},
        ${accountId},
        ${accountExternalId},
        ${categoryId},
        ${budgetId},
        ${tx['Статус'] || 'pending'},
        ${tx['Причина категорії'] || null},
        ${tx['Причина бюджету'] || null},
        ${tx['MCC'] ? parseInt(tx['MCC']) : null},
        ${tx['Опис з банку'] || null},
        ${tx['Одержувач'] || null},
        ${tx['IBAN одержувача'] || null},
        ${balanceAfter || null},
        ${tx['Сума операції'] ? parseKopecks(tx['Сума операції']) : null},
        ${tx['Валюта операції'] || null},
        ${tx['Кешбек'] ? parseKopecks(tx['Кешбек']) : 0},
        ${tx['Комісія'] ? parseKopecks(tx['Комісія']) : 0},
        ${tx['Холд'] === 'TRUE'},
        ${tx['Чек ID'] || null},
        ${tx['Інвойс ID'] || null},
        ${tx['Примітки'] || null}
      )
    `);

    count++;
  }

  console.log(`   Imported ${count} transactions from spreadsheet (max ID: ${maxId}).`);
  return maxId;
}

async function appendNewTransactions(
  currentState: CurrentDbState,
  maxSpreadsheetId: number,
  accountMap: Map<string, number>,
): Promise<number> {
  console.log('\n7. Appending new transactions from current DB state...');

  let count = 0;

  for (const tx of currentState.transactions) {
    const newId = maxSpreadsheetId + tx.id;
    const accountId = accountMap.get(tx.account_external_id) || null;

    await db.execute(sql`
      INSERT INTO transactions (
        id, external_id, date, amount, currency, type,
        account_id, account_external_id, category_id,
        mcc, bank_description, balance_after, operation_amount, operation_currency,
        hold, receipt_id, categorization_status
      ) VALUES (
        ${newId},
        ${tx.external_id},
        ${tx.date},
        ${parseInt(tx.amount)},
        ${tx.currency},
        ${tx.type},
        ${accountId},
        ${tx.account_external_id},
        ${tx.category_id || null},
        ${tx.mcc},
        ${tx.bank_description},
        ${parseInt(tx.balance_after)},
        ${parseInt(tx.operation_amount)},
        ${tx.operation_currency},
        ${tx.hold},
        ${tx.receipt_id},
        ${'pending'}
      )
    `);

    console.log(`   Transaction ${newId}: ${tx.bank_description} (${parseInt(tx.amount) / 100} ${tx.currency})`);
    count++;
  }

  // Update sequence
  const finalMaxId = maxSpreadsheetId + currentState.transactions.length;
  await db.execute(sql`SELECT setval('transactions_id_seq', ${finalMaxId})`);

  console.log(`   Appended ${count} new transactions.`);
  return count;
}

async function importCategorizationRules(): Promise<number> {
  console.log('\n8. Importing categorization rules...');

  const data = await loadJson<SpreadsheetRule[]>('categorization-rules.json');

  for (const rule of data) {
    await db.insert(categorizationRules).values({
      rule: rule['Правило'],
    });
  }

  console.log(`   Imported ${data.length} categorization rules.`);
  return data.length;
}

async function importBudgetizationRules(): Promise<number> {
  console.log('\n9. Importing budgetization rules...');

  const data = await loadJson<SpreadsheetRule[]>('budgetization-rules.json');

  for (const rule of data) {
    await db.insert(budgetizationRules).values({
      rule: rule['Правило'],
    });
  }

  console.log(`   Imported ${data.length} budgetization rules.`);
  return data.length;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Import Spreadsheet Data to Production Database');
  console.log('='.repeat(60));
  console.log(`\nDatabase: ${DATABASE_URL?.substring(0, 50)}...`);
  console.log(`Recovery data: ${RECOVERY_DIR}`);

  try {
    // Load current state
    const currentState = await loadCurrentState();

    // Step 1: Truncate all tables
    await truncateTables();

    // Step 2: Import accounts (from current DB state for correct balances)
    const accountMap = await importAccounts(currentState);

    // Step 3: Import categories
    const categoryMap = await importCategories();

    // Step 4: Import budgets
    const budgetMap = await importBudgets();

    // Step 5: Import allocations
    const allocationCount = await importAllocations(budgetMap);

    // Step 6: Import transactions from spreadsheet
    const maxSpreadsheetId = await importTransactions(categoryMap, budgetMap, accountMap);

    // Step 7: Append new transactions from current DB state
    const newTransactionCount = await appendNewTransactions(currentState, maxSpreadsheetId, accountMap);

    // Step 8: Import categorization rules
    const catRulesCount = await importCategorizationRules();

    // Step 9: Import budgetization rules
    const budRulesCount = await importBudgetizationRules();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`
Summary:
  - Accounts:              ${accountMap.size}
  - Categories:            ${categoryMap.size}
  - Budgets:               ${budgetMap.size}
  - Allocations:           ${allocationCount}
  - Transactions:          ${maxSpreadsheetId} (spreadsheet) + ${newTransactionCount} (new)
  - Categorization Rules:  ${catRulesCount}
  - Budgetization Rules:   ${budRulesCount}
`);

  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
