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
  budgets,
  categories,
  transactions,
} from '../src/modules/database/schema/index.ts';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function clearDatabase() {
  console.log('Clearing existing data...');
  await db.execute(sql`TRUNCATE TABLE allocations, transactions, budgets, categories, accounts RESTART IDENTITY CASCADE`);
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
      { name: 'Здоров\u0027я', status: 'active' },
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
    { name: 'Кав\u0027ярня', parentId: parentMap.get('Їжа'), status: 'active' },
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
    { name: 'Аптека', parentId: parentMap.get('Здоров\u0027я'), status: 'active' },
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

async function seedBudgets() {
  console.log('Seeding budgets...');
  return await db
    .insert(budgets)
    .values([
      {
        name: 'Продукти',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 1000000,
      },
      {
        name: 'Ресторани та кав\u0027ярні',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 500000,
      },
      {
        name: 'Транспорт',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 300000,
      },
      {
        name: 'Розваги',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 400000,
      },
      {
        name: 'Одяг',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 300000,
      },
      {
        name: 'Здоров\u0027я',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 200000,
      },
      {
        name: 'Підписки',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 150000,
      },
      {
        name: 'Комунальні послуги',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 400000,
      },
      {
        name: 'Оренда',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 1500000,
      },
      {
        name: 'Інше',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 200000,
      },
      {
        name: 'Фонд безпеки',
        type: 'savings',
        currency: 'UAH',
        targetAmount: 500000,
      },
      {
        name: 'Відпустка',
        type: 'goal',
        currency: 'UAH',
        targetAmount: 5000000,
        targetDate: '2026-07-01',
      },
      {
        name: 'Новий ноутбук',
        type: 'goal',
        currency: 'UAH',
        targetAmount: 8000000,
        targetDate: '2026-12-01',
      },
      {
        name: 'Страховка авто',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 1200000,
        targetCadence: 'yearly',
      },
      {
        name: 'Погашення кредиту',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 500000,
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
  type: string;
}
interface SeedCategory {
  id: number;
  name: string;
  parentId: number | null;
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
      // Spending budgets get their target amount each month
      // Savings/goal budgets get a portion
      const amount =
        budget.type === 'spending'
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
  const spendingBudgets = seedBudgets.filter(
    (budget) => budget.type === 'spending',
  );

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
    'McDonald\u0027s',
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
    const seededBudgets = await seedBudgets();
    await seedAllocations(seededBudgets);
    await seedTransactions(seededAccounts, seededCategories, seededBudgets);

    console.log('\nSeed complete!');
    console.log(`  Accounts: ${seededAccounts.length}`);
    console.log(`  Categories: ${seededCategories.length}`);
    console.log(`  Budgets: ${seededBudgets.length}`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
