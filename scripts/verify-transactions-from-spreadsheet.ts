/**
 * Verify Transactions from Spreadsheet Recovery Data
 *
 * Matches DB transactions against spreadsheet backup by external_id,
 * restores correct category/budget assignments, and sets categorization status.
 *
 * - Transactions up to and including the target external_id → 'verified'
 * - Transactions after: with category → 'categorized', without → 'pending'
 *
 * Usage:
 *   DATABASE_URL=<url> bun run scripts/verify-transactions-from-spreadsheet.ts
 */

import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  categories,
  budgets,
  transactions,
} from '../src/modules/database/schema/index.ts';

const RECOVERY_DIR = './recovery/spreadsheet-data';
const LAST_VERIFIED_EXTERNAL_ID = 'dV4uVoAFuybjCm6fLg';

interface SpreadsheetTransaction {
  'Категорія': string;
  'Бюджет': string;
  'ID (зовнішній)': string | null;
  'Статус': string | null;
  'Причина категорії': string | null;
  'Причина бюджету': string | null;
}

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function loadSpreadsheetTransactions(): Promise<Map<string, SpreadsheetTransaction>> {
  const file = Bun.file(`${RECOVERY_DIR}/transactions.json`);
  const data: SpreadsheetTransaction[] = await file.json();

  const map = new Map<string, SpreadsheetTransaction>();
  for (const tx of data) {
    const externalId = tx['ID (зовнішній)'];
    if (externalId) {
      map.set(externalId, tx);
    }
  }

  console.log(`Loaded ${map.size} spreadsheet transactions with external IDs`);
  return map;
}

async function loadCategoryMap(): Promise<Map<string, number>> {
  const rows = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, row.id);
  }
  console.log(`Loaded ${map.size} categories from DB`);
  return map;
}

async function loadBudgetMap(): Promise<Map<string, number>> {
  const rows = await db.select({ id: budgets.id, name: budgets.name }).from(budgets);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, row.id);
  }
  console.log(`Loaded ${map.size} budgets from DB`);
  return map;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Verify Transactions from Spreadsheet');
  console.log('='.repeat(60));
  console.log(`Last verified external ID: ${LAST_VERIFIED_EXTERNAL_ID}`);
  console.log();

  const spreadsheetMap = await loadSpreadsheetTransactions();
  const categoryMap = await loadCategoryMap();
  const budgetMap = await loadBudgetMap();

  // Load all DB transactions ordered by date
  const dbTransactions = await db
    .select({
      id: transactions.id,
      externalId: transactions.externalId,
      date: transactions.date,
      bankDescription: transactions.bankDescription,
      categoryId: transactions.categoryId,
      budgetId: transactions.budgetId,
      categorizationStatus: transactions.categorizationStatus,
    })
    .from(transactions)
    .orderBy(transactions.date, transactions.id);

  console.log(`\nFound ${dbTransactions.length} transactions in DB\n`);

  // Find the target transaction to determine the cutoff
  const targetTransaction = dbTransactions.find(
    (tx) => tx.externalId === LAST_VERIFIED_EXTERNAL_ID,
  );

  if (!targetTransaction) {
    console.error(`ERROR: Target transaction ${LAST_VERIFIED_EXTERNAL_ID} not found in DB`);
    process.exit(1);
  }

  console.log(
    `Target transaction: id=${targetTransaction.id}, date=${targetTransaction.date}, desc="${targetTransaction.bankDescription}"`,
  );
  console.log();

  let updatedCount = 0;
  let verifiedCount = 0;
  let categorizedCount = 0;
  let pendingCount = 0;
  let categoryUpdated = 0;
  let budgetUpdated = 0;
  let notInSpreadsheet = 0;
  let passedTarget = false;

  for (const dbTx of dbTransactions) {
    const spreadsheetTx = dbTx.externalId
      ? spreadsheetMap.get(dbTx.externalId)
      : undefined;

    // Determine new category_id and budget_id from spreadsheet
    let newCategoryId: number | null = dbTx.categoryId;
    let newBudgetId: number | null = dbTx.budgetId;
    let newCategoryReason: string | null = null;
    let newBudgetReason: string | null = null;

    if (spreadsheetTx) {
      const spreadsheetCategoryName = spreadsheetTx['Категорія']?.trim() || '';
      const spreadsheetBudgetName = spreadsheetTx['Бюджет']?.trim() || '';

      // Update category
      if (spreadsheetCategoryName) {
        const categoryId = categoryMap.get(spreadsheetCategoryName);
        if (categoryId !== undefined) {
          if (newCategoryId !== categoryId) {
            categoryUpdated++;
          }
          newCategoryId = categoryId;
        } else {
          console.log(
            `  WARNING: Category "${spreadsheetCategoryName}" not found in DB for tx ${dbTx.externalId} (${dbTx.bankDescription})`,
          );
        }
      } else {
        // Empty in spreadsheet → set to null
        if (newCategoryId !== null) {
          categoryUpdated++;
        }
        newCategoryId = null;
      }

      // Update budget
      if (spreadsheetBudgetName) {
        const budgetId = budgetMap.get(spreadsheetBudgetName);
        if (budgetId !== undefined) {
          if (newBudgetId !== budgetId) {
            budgetUpdated++;
          }
          newBudgetId = budgetId;
        } else {
          console.log(
            `  WARNING: Budget "${spreadsheetBudgetName}" not found in DB for tx ${dbTx.externalId} (${dbTx.bankDescription})`,
          );
        }
      } else {
        // Empty in spreadsheet → set to null
        if (newBudgetId !== null) {
          budgetUpdated++;
        }
        newBudgetId = null;
      }

      newCategoryReason = spreadsheetTx['Причина категорії'] || null;
      newBudgetReason = spreadsheetTx['Причина бюджету'] || null;
    } else {
      notInSpreadsheet++;
    }

    // Determine categorization status
    let newStatus: string;

    if (!passedTarget) {
      // Everything up to and including the target → verified
      newStatus = 'verified';
      verifiedCount++;

      if (dbTx.externalId === LAST_VERIFIED_EXTERNAL_ID) {
        passedTarget = true;
      }
    } else {
      // After target: categorized if has category, pending if not
      if (newCategoryId !== null) {
        newStatus = 'categorized';
        categorizedCount++;
      } else {
        newStatus = 'pending';
        pendingCount++;
      }
    }

    // Build update
    await db
      .update(transactions)
      .set({
        categoryId: newCategoryId,
        budgetId: newBudgetId,
        categorizationStatus: newStatus,
        categoryReason: spreadsheetTx ? newCategoryReason : undefined,
        budgetReason: spreadsheetTx ? newBudgetReason : undefined,
      })
      .where(eq(transactions.id, dbTx.id));

    updatedCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`
Summary:
  Total transactions:     ${dbTransactions.length}
  Updated:                ${updatedCount}

  Status breakdown:
    Verified:             ${verifiedCount}
    Categorized:          ${categorizedCount}
    Pending:              ${pendingCount}

  Data changes:
    Categories updated:   ${categoryUpdated}
    Budgets updated:      ${budgetUpdated}
    Not in spreadsheet:   ${notInSpreadsheet}
`);

  await client.end();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
