/**
 * Seed Local Database
 *
 * Populates the local PostgreSQL database with realistic test data
 * for development and testing.
 *
 * Usage:
 *   DATABASE_URL=postgresql://budget_sync:budget_sync@localhost:5432/budget_sync bun run scripts/seed-local-db.ts
 *   just db-seed
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  accounts,
  allocations,
  budgetGroups,
  budgetTargets,
  budgets,
  categories,
  transactions,
} from '../src/modules/database/schema/index.ts';

// --- Production safety guard ---
const PRODUCTION_DB_PATTERNS = [
  'neon.tech',
  'aws.neon.tech',
  'supabase.co',
  '.cloud.',
];

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return '<unparseable-url>';
  }
}

function assertNotProductionDatabase(url: string): void {
  const lowerUrl = url.toLowerCase();
  if (PRODUCTION_DB_PATTERNS.some((pattern) => lowerUrl.includes(pattern))) {
    const maskedHost = maskDatabaseUrl(url);
    console.error(
      `FATAL: Refusing to seed production database! DATABASE_URL points to: ${maskedHost}`,
    );
    process.exit(1);
  }
}
// --- End safety guard ---

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

assertNotProductionDatabase(DATABASE_URL);

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function clearDatabase() {
  console.log('Clearing existing data...');
  await db.execute(sql`TRUNCATE TABLE budget_targets, allocations, transactions, budgets, budget_groups, categories, accounts RESTART IDENTITY CASCADE`);
}

async function seedAccounts() {
  console.log('Seeding accounts...');
  return await db
    .insert(accounts)
    .values([
      {
        externalId: 'mono-black-uah',
        name: 'Mono Black UAH',
        externalName: 'Чорна карта',
        type: 'debit',
        currency: 'UAH',
        balance: 4523700,
        role: 'operational',
        iban: 'UA213996220000026201234567890',
        bank: 'monobank',
      },
      {
        externalId: 'mono-white-uah',
        name: 'Mono White UAH',
        externalName: 'Біла карта',
        type: 'debit',
        currency: 'UAH',
        balance: 1285000,
        role: 'operational',
        iban: 'UA213996220000026201234567891',
        bank: 'monobank',
      },
      {
        externalId: 'mono-fop-uah',
        name: 'FOP UAH',
        externalName: 'ФОП рахунок',
        type: 'debit',
        currency: 'UAH',
        balance: 18750000,
        role: 'operational',
        iban: 'UA213996220000026201234567892',
        bank: 'monobank',
      },
      {
        externalId: 'mono-savings-uah',
        name: 'Savings UAH',
        externalName: 'Скарбничка',
        type: 'debit',
        currency: 'UAH',
        balance: 52000000,
        role: 'savings',
        iban: 'UA213996220000026201234567893',
        bank: 'monobank',
      },
      {
        externalId: 'mono-savings-usd',
        name: 'Savings USD',
        externalName: 'USD скарбничка',
        type: 'debit',
        currency: 'USD',
        balance: 350000,
        role: 'savings',
        iban: 'UA213996220000026201234567894',
        bank: 'monobank',
      },
    ])
    .returning();
}

async function seedCategories() {
  console.log('Seeding categories...');

  // Parent categories
  const parents = await db
    .insert(categories)
    .values([
      { name: 'Їжа', status: 'active' },
      { name: 'Транспорт', status: 'active' },
      { name: 'Житло', status: 'active' },
      { name: 'Розваги', status: 'active' },
      { name: 'Здоров\'я', status: 'active' },
      { name: 'Одяг', status: 'active' },
      { name: 'Підписки', status: 'active' },
      { name: 'Дохід', status: 'active' },
    ])
    .returning();

  const parentMap = new Map(parents.map((parent) => [parent.name, parent.id]));

  // Child categories
  await db.insert(categories).values([
    { name: 'Супермаркет', parentId: parentMap.get('Їжа'), status: 'active' },
    { name: 'Ресторан', parentId: parentMap.get('Їжа'), status: 'active' },
    { name: 'Кав\'ярня', parentId: parentMap.get('Їжа'), status: 'active' },
    { name: 'Доставка їжі', parentId: parentMap.get('Їжа'), status: 'active' },
    { name: 'Таксі', parentId: parentMap.get('Транспорт'), status: 'active' },
    { name: 'Пальне', parentId: parentMap.get('Транспорт'), status: 'active' },
    {
      name: 'Громадський транспорт',
      parentId: parentMap.get('Транспорт'),
      status: 'active',
    },
    {
      name: 'Оренда',
      parentId: parentMap.get('Житло'),
      status: 'active',
    },
    {
      name: 'Комунальні',
      parentId: parentMap.get('Житло'),
      status: 'active',
    },
    { name: 'Інтернет', parentId: parentMap.get('Житло'), status: 'active' },
    { name: 'Кіно', parentId: parentMap.get('Розваги'), status: 'active' },
    { name: 'Ігри', parentId: parentMap.get('Розваги'), status: 'active' },
    { name: 'Аптека', parentId: parentMap.get('Здоров\'я'), status: 'active' },
    {
      name: 'Зарплата',
      parentId: parentMap.get('Дохід'),
      status: 'active',
    },
    {
      name: 'Фріланс',
      parentId: parentMap.get('Дохід'),
      status: 'active',
    },
  ]);

  return await db.select().from(categories);
}

async function seedBudgetGroups() {
  console.log('Seeding budget groups...');
  return await db
    .insert(budgetGroups)
    .values([
      { name: 'Everyday', sortOrder: 'a0' },
      { name: 'Bills & Housing', sortOrder: 'a1' },
      { name: 'Goals & Savings', sortOrder: 'a2' },
    ])
    .returning();
}

async function seedBudgets(groups: Array<{ id: number; name: string }>) {
  console.log('Seeding budgets...');

  const groupMap = new Map(groups.map((group) => [group.name, group.id]));
  const everydayId = groupMap.get('Everyday') ?? null;
  const billsId = groupMap.get('Bills & Housing') ?? null;
  const goalsId = groupMap.get('Goals & Savings') ?? null;

  return await db
    .insert(budgets)
    .values([
      // Everyday group budgets (monthly)
      {
        name: 'Продукти',
        currency: 'UAH',
        targetAmount: 1000000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a0',
        budgetGroupId: everydayId,
      },
      {
        name: 'Ресторани та кав\'ярні',
        currency: 'UAH',
        targetAmount: 500000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a1',
        budgetGroupId: everydayId,
      },
      {
        name: 'Транспорт',
        currency: 'UAH',
        targetAmount: 300000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a2',
        budgetGroupId: everydayId,
      },
      {
        name: 'Розваги',
        currency: 'UAH',
        targetAmount: 400000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a3',
        budgetGroupId: everydayId,
      },
      {
        name: 'Одяг',
        currency: 'UAH',
        targetAmount: 300000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a4',
        budgetGroupId: everydayId,
      },
      {
        name: 'Здоров\'я',
        currency: 'UAH',
        targetAmount: 200000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a5',
        budgetGroupId: everydayId,
      },
      // Bills & Housing group budgets (monthly)
      {
        name: 'Підписки',
        currency: 'UAH',
        targetAmount: 150000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a6',
        budgetGroupId: billsId,
      },
      {
        name: 'Комунальні послуги',
        currency: 'UAH',
        targetAmount: 400000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a7',
        budgetGroupId: billsId,
      },
      {
        name: 'Оренда',
        currency: 'UAH',
        targetAmount: 1500000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a8',
        budgetGroupId: billsId,
      },
      // Ungrouped budget (monthly)
      {
        name: 'Інше',
        currency: 'UAH',
        targetAmount: 200000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'a9',
      },
      // Goals & Savings group budgets
      {
        name: 'Фонд безпеки',
        currency: 'UAH',
        targetAmount: 500000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        cap: 20000000,
        sortOrder: 'aA',
        budgetGroupId: goalsId,
      },
      {
        name: 'Відпустка',
        currency: 'UAH',
        targetAmount: 5000000,
        targetDate: '2026-07-01',
        sortOrder: 'aB',
        budgetGroupId: goalsId,
      },
      {
        name: 'Новий ноутбук',
        currency: 'UAH',
        targetAmount: 8000000,
        targetDate: '2026-12-01',
        sortOrder: 'aC',
        budgetGroupId: goalsId,
      },
      // Periodic budgets (non-standard cadence)
      {
        name: 'Страховка авто',
        currency: 'UAH',
        targetAmount: 1200000,
        cadenceUnit: 'year',
        cadenceCount: 1,
        sortOrder: 'aD',
        budgetGroupId: billsId,
      },
      {
        name: 'Абонемент спортзалу',
        currency: 'UAH',
        targetAmount: 200000,
        cadenceUnit: 'week',
        cadenceCount: 2,
        sortOrder: 'aE',
        budgetGroupId: everydayId,
      },
      {
        name: 'Квартальний податок',
        currency: 'UAH',
        targetAmount: 900000,
        cadenceUnit: 'month',
        cadenceCount: 3,
        sortOrder: 'aF',
        budgetGroupId: billsId,
      },
      {
        name: 'Щоденні витрати на каву',
        currency: 'UAH',
        targetAmount: 10000,
        cadenceUnit: 'day',
        cadenceCount: 5,
        sortOrder: 'aG',
        budgetGroupId: everydayId,
      },
      {
        name: 'Погашення кредиту',
        currency: 'UAH',
        targetAmount: 500000,
        cadenceUnit: 'month',
        cadenceCount: 1,
        sortOrder: 'aH',
        budgetGroupId: billsId,
      },
    ])
    .returning();
}

interface SeedAccount {
  id: number;
  role: string | null;
}
interface SeedBudget {
  id: number;
  name: string;
  cadenceUnit: string | null;
  cadenceCount: number | null;
  targetDate: string | null;
  cap: number | null;
}
interface SeedCategory {
  id: number;
  name: string;
  parentId: number | null;
}

async function seedBudgetTargets(seedBudgets: SeedBudget[]) {
  console.log('Seeding budget target history...');

  // Simulate a target change for "Продукти": was 800000 in Dec 2025, changed to 1000000 in Jan 2026
  const produktyBudget = seedBudgets.find((budget) => budget.name === 'Продукти');
  // Simulate a target change for "Фонд безпеки": was 300000, increased to 500000 in Feb 2026
  const securityFundBudget = seedBudgets.find((budget) => budget.name === 'Фонд безпеки');

  const targetRows: Array<{
    budgetId: number;
    targetAmount: number;
    effectiveFrom: string;
  }> = [];

  if (produktyBudget) {
    targetRows.push(
      { budgetId: produktyBudget.id, targetAmount: 800000, effectiveFrom: '2025-12' },
      { budgetId: produktyBudget.id, targetAmount: 1000000, effectiveFrom: '2026-01' },
    );
  }

  if (securityFundBudget) {
    targetRows.push(
      { budgetId: securityFundBudget.id, targetAmount: 300000, effectiveFrom: '2025-12' },
      { budgetId: securityFundBudget.id, targetAmount: 500000, effectiveFrom: '2026-02' },
    );
  }

  if (targetRows.length > 0) {
    await db.insert(budgetTargets).values(targetRows);
    console.log(`  Inserted ${targetRows.length} budget target history entries`);
  }
}

function isRegularMonthlyBudget(budget: SeedBudget): boolean {
  return budget.cadenceUnit === 'month' && budget.cadenceCount === 1 && !budget.targetDate;
}

async function seedAllocations(seedBudgets: SeedBudget[]) {
  console.log('Seeding allocations...');

  const periods = ['2025-12', '2026-01', '2026-02'];
  const allocationRows: Array<{
    budgetId: number;
    amount: number;
    period: string;
    date: string;
  }> = [];

  for (const budget of seedBudgets) {
    for (const period of periods) {
      const amount = isRegularMonthlyBudget(budget)
        ? budget.name === 'Оренда'
          ? 1500000
          : budget.name === 'Продукти'
            ? 1000000
            : budget.name === 'Комунальні послуги'
              ? 400000
              : 300000
        : 500000;

      allocationRows.push({
        budgetId: budget.id,
        amount,
        period,
        date: `${period}-01`,
      });
    }
  }

  await db.insert(allocations).values(allocationRows);
}

async function seedTransactions(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding transactions...');

  const operationalAccounts = seedAccounts.filter(
    (account) => account.role === 'operational',
  );
  const expenseCategories = seedCategories.filter(
    (category) =>
      category.parentId !== null &&
      !['Зарплата', 'Фріланс'].includes(category.name),
  );
  const incomeCategories = seedCategories.filter((category) =>
    ['Зарплата', 'Фріланс'].includes(category.name),
  );
  const spendingBudgets = seedBudgets.filter((budget) => isRegularMonthlyBudget(budget));

  const transactionRows: Array<{
    externalId: string;
    date: Date;
    amount: number;
    currency: string;
    type: string;
    accountId: number;
    accountExternalId: string;
    categoryId: number;
    budgetId: number | null;
    categorizationStatus: string;
    counterparty: string;
    bankDescription: string;
    mcc: number;
  }> = [];

  const counterparties = [
    'Сільпо',
    'АТБ',
    'Новус',
    'Bolt',
    'Uber',
    'OKKO',
    'WOG',
    'Netflix',
    'Spotify',
    'Київстар',
    'Аптека АНЦ',
    'Zara',
    'H&M',
    'McDonald\'s',
    'Starbucks',
    'Multiplex',
  ];

  let txCounter = 0;

  // Generate transactions for 3 months
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const year = monthOffset === 0 ? 2025 : 2026;
    const month = monthOffset === 0 ? 12 : monthOffset;

    // Income transactions (2 per month)
    for (let incomeIndex = 0; incomeIndex < 2; incomeIndex++) {
      txCounter++;
      const account =
        operationalAccounts[incomeIndex % operationalAccounts.length];
      if (!account) continue;
      const category =
        incomeCategories[incomeIndex % incomeCategories.length];
      if (!category) continue;

      transactionRows.push({
        externalId: `seed-tx-${txCounter}`,
        date: new Date(year, month - 1, incomeIndex === 0 ? 5 : 20),
        amount: incomeIndex === 0 ? 7500000 : 3500000,
        currency: 'UAH',
        type: 'credit',
        accountId: account.id,
        accountExternalId: `mono-account-${account.id}`,
        categoryId: category.id,
        budgetId: null,
        categorizationStatus: 'verified',
        counterparty: incomeIndex === 0 ? 'ТОВ Роботодавець' : 'Upwork',
        bankDescription:
          incomeIndex === 0
            ? 'Зарплата за місяць'
            : 'Оплата за фріланс проект',
        mcc: 0,
      });
    }

    // Expense transactions (~60 per month)
    for (
      let expenseIndex = 0;
      expenseIndex < 60;
      expenseIndex++
    ) {
      txCounter++;
      const account =
        operationalAccounts[expenseIndex % operationalAccounts.length];
      if (!account) continue;
      const category =
        expenseCategories[expenseIndex % expenseCategories.length];
      if (!category) continue;
      const budget = spendingBudgets[expenseIndex % spendingBudgets.length];

      // Random amount between -5000 and -50000 kopecks (-50 to -500 UAH)
      const amount = -(5000 + Math.floor(Math.random() * 45000));
      const day = 1 + (expenseIndex % 28);
      const counterparty =
        counterparties[expenseIndex % counterparties.length] ?? 'Unknown';

      transactionRows.push({
        externalId: `seed-tx-${txCounter}`,
        date: new Date(year, month - 1, day),
        amount,
        currency: 'UAH',
        type: 'debit',
        accountId: account.id,
        accountExternalId: `mono-account-${account.id}`,
        categoryId: category.id,
        budgetId: budget?.id ?? null,
        categorizationStatus:
          expenseIndex % 5 === 0 ? 'pending' : 'verified',
        counterparty,
        bankDescription: `Оплата ${counterparty}`,
        mcc: 5411 + (expenseIndex % 20),
      });
    }
  }

  // Insert in batches of 50
  for (
    let batchIndex = 0;
    batchIndex < transactionRows.length;
    batchIndex += 50
  ) {
    await db
      .insert(transactions)
      .values(transactionRows.slice(batchIndex, batchIndex + 50));
  }

  console.log(`  Inserted ${transactionRows.length} transactions`);
}

async function main() {
  console.log('Seeding local database...');
  console.log(`Database: ${DATABASE_URL}\n`);

  try {
    await clearDatabase();

    const seededAccounts = await seedAccounts();
    const seededCategories = await seedCategories();
    const seededBudgetGroups = await seedBudgetGroups();
    const seededBudgets = await seedBudgets(seededBudgetGroups);
    await seedBudgetTargets(seededBudgets);
    await seedAllocations(seededBudgets);
    await seedTransactions(seededAccounts, seededCategories, seededBudgets);

    console.log('\nSeed complete!');
    console.log(`  Accounts: ${seededAccounts.length}`);
    console.log(`  Categories: ${seededCategories.length}`);
    console.log(`  Budget groups: ${seededBudgetGroups.length}`);
    console.log(`  Budgets: ${seededBudgets.length}`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
