/**
 * Migration verification script
 *
 * Compares row counts between spreadsheet and database, and verifies
 * sample data integrity (e.g., foreign key references are correct).
 *
 * Usage: bun scripts/verify-migration.ts
 */

import 'reflect-metadata';
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import {
  ACCOUNTS_SHEET_NAME,
  accountSchema,
} from '@infrastructure/repositories/schemas/accountSchema.ts';
import {
  BUDGETIZATION_RULES_SHEET_NAME,
  budgetizationRuleSchema,
} from '@infrastructure/repositories/schemas/budgetizationRuleSchema.ts';
import {
  BUDGETS_SHEET_NAME,
  budgetSchema,
} from '@infrastructure/repositories/schemas/budgetSchema.ts';
import {
  CATEGORIES_SHEET_NAME,
  categorySchema,
} from '@infrastructure/repositories/schemas/categorySchema.ts';
import {
  CATEGORIZATION_RULES_SHEET_NAME,
  categorizationRuleSchema,
} from '@infrastructure/repositories/schemas/categorizationRuleSchema.ts';
import {
  TRANSACTIONS_SHEET_NAME,
  transactionSchema,
} from '@infrastructure/repositories/schemas/transactionSchema.ts';
import { DatabaseClient } from '@modules/database/DatabaseClient.ts';
import {
  accounts,
  budgetizationRules,
  budgets,
  categories,
  categorizationRules,
  transactions,
} from '@modules/database/schema/index.ts';
import {
  SpreadsheetsClient,
  SpreadsheetTable,
} from '@modules/spreadsheet/index.ts';

interface VerificationResult {
  entity: string;
  spreadsheetCount: number;
  databaseCount: number;
  match: boolean;
  diff: number;
}

async function verifyRowCounts(
  spreadsheetClient: SpreadsheetsClient,
  dbClient: DatabaseClient,
  spreadsheetId: string,
): Promise<VerificationResult[]> {
  console.log('=== Verifying Row Counts ===\n');

  const results: VerificationResult[] = [];

  const categoriesSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    CATEGORIES_SHEET_NAME,
    categorySchema,
  );
  const categoriesRecords = await categoriesSpreadsheet.readRows();
  const categoriesDb = await dbClient.db.select().from(categories);
  results.push({
    entity: 'Categories',
    spreadsheetCount: categoriesRecords.length,
    databaseCount: categoriesDb.length,
    match: categoriesRecords.length === categoriesDb.length,
    diff: categoriesDb.length - categoriesRecords.length,
  });

  const budgetsSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    BUDGETS_SHEET_NAME,
    budgetSchema,
  );
  const budgetsRecords = await budgetsSpreadsheet.readRows();
  const budgetsDb = await dbClient.db.select().from(budgets);
  results.push({
    entity: 'Budgets',
    spreadsheetCount: budgetsRecords.length,
    databaseCount: budgetsDb.length,
    match: budgetsRecords.length === budgetsDb.length,
    diff: budgetsDb.length - budgetsRecords.length,
  });

  const accountsSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    ACCOUNTS_SHEET_NAME,
    accountSchema,
  );
  const accountsRecords = await accountsSpreadsheet.readRows();
  const accountsDb = await dbClient.db.select().from(accounts);
  results.push({
    entity: 'Accounts',
    spreadsheetCount: accountsRecords.length,
    databaseCount: accountsDb.length,
    match: accountsRecords.length === accountsDb.length,
    diff: accountsDb.length - accountsRecords.length,
  });

  const transactionsSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    TRANSACTIONS_SHEET_NAME,
    transactionSchema,
  );
  const transactionsRecords = await transactionsSpreadsheet.readRows();
  const transactionsDb = await dbClient.db.select().from(transactions);
  results.push({
    entity: 'Transactions',
    spreadsheetCount: transactionsRecords.length,
    databaseCount: transactionsDb.length,
    match: transactionsRecords.length === transactionsDb.length,
    diff: transactionsDb.length - transactionsRecords.length,
  });

  const categorizationRulesSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    CATEGORIZATION_RULES_SHEET_NAME,
    categorizationRuleSchema,
  );
  const categorizationRulesRecords =
    await categorizationRulesSpreadsheet.readRows();
  const categorizationRulesDb = await dbClient.db
    .select()
    .from(categorizationRules);
  results.push({
    entity: 'Categorization Rules',
    spreadsheetCount: categorizationRulesRecords.length,
    databaseCount: categorizationRulesDb.length,
    match: categorizationRulesRecords.length === categorizationRulesDb.length,
    diff: categorizationRulesDb.length - categorizationRulesRecords.length,
  });

  const budgetizationRulesSpreadsheet = new SpreadsheetTable(
    spreadsheetClient,
    spreadsheetId,
    BUDGETIZATION_RULES_SHEET_NAME,
    budgetizationRuleSchema,
  );
  const budgetizationRulesRecords =
    await budgetizationRulesSpreadsheet.readRows();
  const budgetizationRulesDb = await dbClient.db
    .select()
    .from(budgetizationRules);
  results.push({
    entity: 'Budgetization Rules',
    spreadsheetCount: budgetizationRulesRecords.length,
    databaseCount: budgetizationRulesDb.length,
    match: budgetizationRulesRecords.length === budgetizationRulesDb.length,
    diff: budgetizationRulesDb.length - budgetizationRulesRecords.length,
  });

  return results;
}

async function verifySampleDataIntegrity(
  dbClient: DatabaseClient,
): Promise<void> {
  console.log('\n=== Verifying Sample Data Integrity ===\n');

  const sampleTransactions = await dbClient.db
    .select()
    .from(transactions)
    .limit(10);

  console.log(`Checking ${sampleTransactions.length} sample transactions...\n`);

  let integrityIssues = 0;

  for (const transaction of sampleTransactions) {
    const issues: string[] = [];

    if (transaction.accountId) {
      const [account] = await dbClient.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, transaction.accountId))
        .limit(1);

      if (!account) {
        issues.push(
          `Account ID ${transaction.accountId} referenced but not found`,
        );
      }
    }

    if (transaction.categoryId) {
      const [category] = await dbClient.db
        .select()
        .from(categories)
        .where(eq(categories.id, transaction.categoryId))
        .limit(1);

      if (!category) {
        issues.push(
          `Category ID ${transaction.categoryId} referenced but not found`,
        );
      }
    }

    if (transaction.budgetId) {
      const [budget] = await dbClient.db
        .select()
        .from(budgets)
        .where(eq(budgets.id, transaction.budgetId))
        .limit(1);

      if (!budget) {
        issues.push(
          `Budget ID ${transaction.budgetId} referenced but not found`,
        );
      }
    }

    if (issues.length > 0) {
      console.log(`Transaction ID ${transaction.id}:`);
      for (const issue of issues) {
        console.log(`  ❌ ${issue}`);
      }
      integrityIssues += issues.length;
    }
  }

  if (integrityIssues === 0) {
    console.log('✅ All sample transactions have valid foreign key references');
  } else {
    console.log(`\n⚠️  Found ${integrityIssues} integrity issue(s)`);
  }
}

async function main(): Promise<void> {
  const spreadsheetId = process.env['SPREADSHEET_ID'];
  const databaseUrl = process.env['DATABASE_URL'];
  const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

  if (!spreadsheetId || !databaseUrl) {
    console.error('❌ Missing required environment variables:');
    if (!spreadsheetId) console.error('  - SPREADSHEET_ID');
    if (!databaseUrl) console.error('  - DATABASE_URL');
    process.exit(1);
  }

  const spreadsheetClient = new SpreadsheetsClient({
    serviceAccountFile,
  });
  const dbClient = new DatabaseClient({ url: databaseUrl });

  try {
    const results = await verifyRowCounts(
      spreadsheetClient,
      dbClient,
      spreadsheetId,
    );

    console.log('Entity                  | Spreadsheet | Database | Diff  | Match');
    console.log('------------------------|-------------|----------|-------|------');

    let allMatch = true;
    for (const result of results) {
      const matchIcon = result.match ? '✅' : '❌';
      const diffStr =
        result.diff > 0 ? `+${result.diff}` : result.diff.toString();
      console.log(
        `${result.entity.padEnd(23)} | ${result.spreadsheetCount.toString().padStart(11)} | ${result.databaseCount.toString().padStart(8)} | ${diffStr.padStart(5)} | ${matchIcon}`,
      );
      allMatch = allMatch && result.match;
    }

    await verifySampleDataIntegrity(dbClient);

    console.log('\n=== Verification Summary ===');
    if (allMatch) {
      console.log('✅ All row counts match between spreadsheet and database');
    } else {
      console.log(
        '⚠️  Some row counts differ - see table above for details',
      );
    }
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await dbClient.disconnect();
  }
}

main();
