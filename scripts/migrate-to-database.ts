/**
 * One-time migration script: Spreadsheet -> Neon Database
 *
 * Reads all data from Google Spreadsheet and inserts it into the Postgres database.
 * Migration order follows FK dependencies:
 * 1. Categories (no FK deps)
 * 2. Budgets (no FK deps)
 * 3. Accounts (no FK deps)
 * 4. Transactions (references accounts, categories, budgets)
 * 5. Categorization rules
 * 6. Budgetization rules
 *
 * Usage: bun scripts/migrate-to-database.ts
 */

import 'reflect-metadata';
import 'dotenv/config';

import type { AccountRecord } from '@infrastructure/mappers/SpreadsheetAccountMapper.ts';
import type { BudgetRecord } from '@infrastructure/mappers/SpreadsheetBudgetMapper.ts';
import type { CategoryRecord } from '@infrastructure/mappers/SpreadsheetCategoryMapper.ts';
import type { TransactionRecord } from '@infrastructure/mappers/SpreadsheetTransactionMapper.ts';
import { DatabaseAccountMapper } from '@infrastructure/mappers/DatabaseAccountMapper.ts';
import { DatabaseBudgetMapper } from '@infrastructure/mappers/DatabaseBudgetMapper.ts';
import { DatabaseCategoryMapper } from '@infrastructure/mappers/DatabaseCategoryMapper.ts';
import { DatabaseTransactionMapper } from '@infrastructure/mappers/DatabaseTransactionMapper.ts';
import { SpreadsheetAccountMapper } from '@infrastructure/mappers/SpreadsheetAccountMapper.ts';
import { SpreadsheetBudgetMapper } from '@infrastructure/mappers/SpreadsheetBudgetMapper.ts';
import { SpreadsheetCategoryMapper } from '@infrastructure/mappers/SpreadsheetCategoryMapper.ts';
import { SpreadsheetTransactionMapper } from '@infrastructure/mappers/SpreadsheetTransactionMapper.ts';
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
import type {
  NewBudgetizationRuleRow,
  NewCategorizationRuleRow,
  NewTransactionRow,
} from '@modules/database/types.ts';
import {
  SpreadsheetsClient,
  SpreadsheetTable,
} from '@modules/spreadsheet/index.ts';

interface MigrationStats {
  categories: number;
  budgets: number;
  accounts: number;
  transactions: number;
  categorizationRules: number;
  budgetizationRules: number;
  errors: string[];
}

const BATCH_SIZE = 100;

async function migrateCategories(
  spreadsheetTable: SpreadsheetTable<typeof categorySchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
): Promise<Map<string, number>> {
  console.log('\n[1/6] Migrating categories...');
  const mapper = new SpreadsheetCategoryMapper();
  const dbMapper = new DatabaseCategoryMapper();
  const nameToId = new Map<string, number>();

  const rawRecords = await spreadsheetTable.readRows();
  const records = rawRecords as CategoryRecord[];
  console.log(`Found ${records.length} categories in spreadsheet`);

  const categoryEntities = records.map((record) => mapper.toEntity(record));

  const categoriesWithoutParent = categoryEntities.filter(
    (category) => !category.parent,
  );
  const categoriesWithParent = categoryEntities.filter(
    (category) => category.parent,
  );

  for (const category of categoriesWithoutParent) {
    try {
      const insertRow = dbMapper.toInsert(category, undefined);
      const [inserted] = await dbClient.db
        .insert(categories)
        .values(insertRow)
        .onConflictDoNothing({ target: categories.name })
        .returning();

      if (inserted) {
        nameToId.set(category.name, inserted.id);
        stats.categories++;
      }
    } catch (error) {
      stats.errors.push(`Category ${category.name}: ${error}`);
    }
  }

  for (const category of categoriesWithParent) {
    try {
      const parentDbId = category.parent
        ? nameToId.get(category.parent)
        : undefined;
      const insertRow = dbMapper.toInsert(category, parentDbId);
      const [inserted] = await dbClient.db
        .insert(categories)
        .values(insertRow)
        .onConflictDoNothing({ target: categories.name })
        .returning();

      if (inserted) {
        nameToId.set(category.name, inserted.id);
        stats.categories++;
      }
    } catch (error) {
      stats.errors.push(`Category ${category.name}: ${error}`);
    }
  }

  console.log(`Migrated ${stats.categories} categories`);
  return nameToId;
}

async function migrateBudgets(
  spreadsheetTable: SpreadsheetTable<typeof budgetSchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
): Promise<Map<string, number>> {
  console.log('\n[2/6] Migrating budgets...');
  const mapper = new SpreadsheetBudgetMapper();
  const dbMapper = new DatabaseBudgetMapper();
  const nameToId = new Map<string, number>();

  const rawRecords = await spreadsheetTable.readRows();
  const records = rawRecords as BudgetRecord[];
  console.log(`Found ${records.length} budgets in spreadsheet`);

  for (const record of records) {
    try {
      const entity = mapper.toEntity(record);
      const insertRow = dbMapper.toInsert(entity);
      const [inserted] = await dbClient.db
        .insert(budgets)
        .values(insertRow)
        .onConflictDoNothing({ target: budgets.name })
        .returning();

      if (inserted) {
        nameToId.set(entity.name, inserted.id);
        stats.budgets++;
      }
    } catch (error) {
      stats.errors.push(`Budget ${record.name}: ${error}`);
    }
  }

  console.log(`Migrated ${stats.budgets} budgets`);
  return nameToId;
}

async function migrateAccounts(
  spreadsheetTable: SpreadsheetTable<typeof accountSchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
): Promise<Map<string, number>> {
  console.log('\n[3/6] Migrating accounts...');
  const mapper = new SpreadsheetAccountMapper();
  const dbMapper = new DatabaseAccountMapper();
  const externalIdToDbId = new Map<string, number>();

  const rawRecords = await spreadsheetTable.readRows();
  const records = rawRecords as AccountRecord[];
  console.log(`Found ${records.length} accounts in spreadsheet`);

  for (const record of records) {
    try {
      const entity = mapper.toEntity(record);
      const insertRow = dbMapper.toInsert(entity, record.name);
      const [inserted] = await dbClient.db
        .insert(accounts)
        .values(insertRow)
        .onConflictDoNothing({ target: accounts.externalId })
        .returning();

      if (inserted && entity.externalId) {
        externalIdToDbId.set(entity.externalId, inserted.id);
        stats.accounts++;
      }
    } catch (error) {
      stats.errors.push(
        `Account ${record.name ?? record.externalId}: ${error}`,
      );
    }
  }

  console.log(`Migrated ${stats.accounts} accounts`);
  return externalIdToDbId;
}

async function migrateTransactions(
  spreadsheetTable: SpreadsheetTable<typeof transactionSchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
  accountExternalIdToDbId: Map<string, number>,
  categoryNameToDbId: Map<string, number>,
  budgetNameToDbId: Map<string, number>,
): Promise<void> {
  console.log('\n[4/6] Migrating transactions...');
  const mapper = new SpreadsheetTransactionMapper();
  const dbMapper = new DatabaseTransactionMapper();

  const rawRecords = await spreadsheetTable.readRows();
  const records = rawRecords as TransactionRecord[];
  console.log(`Found ${records.length} transactions in spreadsheet`);

  const batches: TransactionRecord[][] = [];
  for (
    let batchIndex = 0;
    batchIndex < records.length;
    batchIndex += BATCH_SIZE
  ) {
    batches.push(records.slice(batchIndex, batchIndex + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (!batch) {
      continue;
    }

    console.log(
      `Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} transactions)`,
    );
    const insertRows: NewTransactionRow[] = [];

    for (const record of batch) {
      try {
        const entity = mapper.toEntity(record, record.accountExternalId ?? '');

        const accountDbId = record.accountExternalId
          ? accountExternalIdToDbId.get(record.accountExternalId)
          : undefined;
        const categoryDbId = record.category
          ? categoryNameToDbId.get(record.category)
          : undefined;
        const budgetDbId = record.budget
          ? budgetNameToDbId.get(record.budget)
          : undefined;

        const insertRow = dbMapper.toInsert(entity, {
          accountDbId,
          categoryDbId,
          budgetDbId,
        });

        insertRows.push(insertRow);
      } catch (error) {
        stats.errors.push(
          `Transaction ${record.externalId ?? record.date}: ${error}`,
        );
      }
    }

    if (insertRows.length > 0) {
      try {
        await dbClient.db
          .insert(transactions)
          .values(insertRows)
          .onConflictDoNothing({ target: transactions.externalId });
        stats.transactions += insertRows.length;
      } catch (error) {
        stats.errors.push(`Batch ${batchIdx + 1} insert failed: ${error}`);
      }
    }
  }

  console.log(`Migrated ${stats.transactions} transactions`);
}

async function migrateCategorizationRules(
  spreadsheetTable: SpreadsheetTable<typeof categorizationRuleSchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
): Promise<void> {
  console.log('\n[5/6] Migrating categorization rules...');

  const records = await spreadsheetTable.readRows();
  console.log(`Found ${records.length} categorization rules in spreadsheet`);

  const insertRows: NewCategorizationRuleRow[] = records.map(
    (record, index) => ({
      rule: String(record.rule),
      priority: index,
    }),
  );

  if (insertRows.length > 0) {
    try {
      await dbClient.db
        .insert(categorizationRules)
        .values(insertRows)
        .onConflictDoNothing();
      stats.categorizationRules = insertRows.length;
    } catch (error) {
      stats.errors.push(`Categorization rules insert failed: ${error}`);
    }
  }

  console.log(`Migrated ${stats.categorizationRules} categorization rules`);
}

async function migrateBudgetizationRules(
  spreadsheetTable: SpreadsheetTable<typeof budgetizationRuleSchema>,
  dbClient: DatabaseClient,
  stats: MigrationStats,
): Promise<void> {
  console.log('\n[6/6] Migrating budgetization rules...');

  const records = await spreadsheetTable.readRows();
  console.log(`Found ${records.length} budgetization rules in spreadsheet`);

  const insertRows: NewBudgetizationRuleRow[] = records.map(
    (record, index) => ({
      rule: String(record.rule),
      priority: index,
    }),
  );

  if (insertRows.length > 0) {
    try {
      await dbClient.db
        .insert(budgetizationRules)
        .values(insertRows)
        .onConflictDoNothing();
      stats.budgetizationRules = insertRows.length;
    } catch (error) {
      stats.errors.push(`Budgetization rules insert failed: ${error}`);
    }
  }

  console.log(`Migrated ${stats.budgetizationRules} budgetization rules`);
}

async function main(): Promise<void> {
  console.log('=== Spreadsheet -> Database Migration ===\n');
  const startTime = Date.now();

  const spreadsheetId = process.env['SPREADSHEET_ID'];
  const databaseUrl = process.env['DATABASE_URL'];
  const serviceAccountFile = process.env['GOOGLE_SERVICE_ACCOUNT_FILE'];

  if (!spreadsheetId || !databaseUrl) {
    console.error('Missing required environment variables:');
    if (!spreadsheetId) console.error('  - SPREADSHEET_ID');
    if (!databaseUrl) console.error('  - DATABASE_URL');
    process.exit(1);
  }

  const spreadsheetClient = new SpreadsheetsClient({
    serviceAccountFile,
  });
  const dbClient = new DatabaseClient({ url: databaseUrl });

  const stats: MigrationStats = {
    categories: 0,
    budgets: 0,
    accounts: 0,
    transactions: 0,
    categorizationRules: 0,
    budgetizationRules: 0,
    errors: [],
  };

  try {
    const categoryNameToDbId = await migrateCategories(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        CATEGORIES_SHEET_NAME,
        categorySchema,
      ),
      dbClient,
      stats,
    );

    const budgetNameToDbId = await migrateBudgets(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        BUDGETS_SHEET_NAME,
        budgetSchema,
      ),
      dbClient,
      stats,
    );

    const accountExternalIdToDbId = await migrateAccounts(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        ACCOUNTS_SHEET_NAME,
        accountSchema,
      ),
      dbClient,
      stats,
    );

    await migrateTransactions(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        TRANSACTIONS_SHEET_NAME,
        transactionSchema,
      ),
      dbClient,
      stats,
      accountExternalIdToDbId,
      categoryNameToDbId,
      budgetNameToDbId,
    );

    await migrateCategorizationRules(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        CATEGORIZATION_RULES_SHEET_NAME,
        categorizationRuleSchema,
      ),
      dbClient,
      stats,
    );

    await migrateBudgetizationRules(
      new SpreadsheetTable(
        spreadsheetClient,
        spreadsheetId,
        BUDGETIZATION_RULES_SHEET_NAME,
        budgetizationRuleSchema,
      ),
      dbClient,
      stats,
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n=== Migration Summary ===');
    console.log(`Total time: ${duration}s`);
    console.log(`Categories: ${stats.categories}`);
    console.log(`Budgets: ${stats.budgets}`);
    console.log(`Accounts: ${stats.accounts}`);
    console.log(`Transactions: ${stats.transactions}`);
    console.log(`Categorization rules: ${stats.categorizationRules}`);
    console.log(`Budgetization rules: ${stats.budgetizationRules}`);
    console.log(
      `Total records: ${stats.categories + stats.budgets + stats.accounts + stats.transactions + stats.categorizationRules + stats.budgetizationRules}`,
    );

    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`);
      for (const error of stats.errors.slice(0, 10)) {
        console.log(`  - ${error}`);
      }
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more`);
      }
    }

    console.log('\nMigration completed');
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await dbClient.disconnect();
  }
}

main();
