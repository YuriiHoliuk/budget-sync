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
  bankTransactions,
  budgetGroups,
  budgetTargets,
  budgets,
  budgetizationRules,
  categories,
  categorizationRules,
  transactionSources,
  transactions,
  transferPairs,
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
  await db.execute(sql`TRUNCATE TABLE transfer_pairs, transaction_sources, bank_transactions, budget_targets, allocations, transactions, budgets, budget_groups, categories, accounts, categorization_rules, budgetization_rules RESTART IDENTITY CASCADE`);
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
      {
        externalId: 'manual-cash-uah',
        name: 'Cash UAH',
        type: 'debit',
        currency: 'UAH',
        balance: 850000,
        role: 'operational',
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
      // Everyday group budgets
      {
        name: 'Продукти',
        currency: 'UAH',
        targetAmount: 1000000,
        sortOrder: 'a0',
        budgetGroupId: everydayId,
      },
      {
        name: 'Ресторани та кав\'ярні',
        currency: 'UAH',
        targetAmount: 500000,
        sortOrder: 'a1',
        budgetGroupId: everydayId,
      },
      {
        name: 'Транспорт',
        currency: 'UAH',
        targetAmount: 300000,
        sortOrder: 'a2',
        budgetGroupId: everydayId,
      },
      {
        name: 'Розваги',
        currency: 'UAH',
        targetAmount: 400000,
        sortOrder: 'a3',
        budgetGroupId: everydayId,
      },
      {
        name: 'Одяг',
        currency: 'UAH',
        targetAmount: 300000,
        sortOrder: 'a4',
        budgetGroupId: everydayId,
      },
      {
        name: 'Здоров\'я',
        currency: 'UAH',
        targetAmount: 200000,
        sortOrder: 'a5',
        budgetGroupId: everydayId,
      },
      // Bills & Housing group budgets
      {
        name: 'Підписки',
        currency: 'UAH',
        targetAmount: 150000,
        sortOrder: 'a6',
        budgetGroupId: billsId,
      },
      {
        name: 'Комунальні послуги',
        currency: 'UAH',
        targetAmount: 400000,
        sortOrder: 'a7',
        budgetGroupId: billsId,
      },
      {
        name: 'Оренда',
        currency: 'UAH',
        targetAmount: 1500000,
        sortOrder: 'a8',
        budgetGroupId: billsId,
      },
      // Ungrouped budget
      {
        name: 'Інше',
        currency: 'UAH',
        targetAmount: 200000,
        sortOrder: 'a9',
      },
      // Goals & Savings group budgets
      {
        name: 'Фонд безпеки',
        currency: 'UAH',
        targetAmount: 500000,
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
      // Periodic budgets in Bills group
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

function isSimpleTargetBudget(budget: SeedBudget): boolean {
  return !budget.cadenceUnit && !budget.targetDate;
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
      const amount = isSimpleTargetBudget(budget)
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
  const spendingBudgets = seedBudgets.filter((budget) => isSimpleTargetBudget(budget));

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

      // Random positive amount between 5000 and 50000 kopecks (50 to 500 UAH)
      const amount = 5000 + Math.floor(Math.random() * 45000);
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

async function seedBankTransactionsAndSources() {
  console.log('Seeding bank transactions and transaction sources...');

  // Get all transactions to create bank_transactions for each
  const allTxRows = await db.select().from(transactions);

  const bankTxRows: Array<{
    externalId: string;
    accountId: number;
    date: Date;
    amount: number;
    currency: string;
    type: string;
    bankDescription: string | null;
    counterparty: string | null;
    mcc: number | null;
    commission: number | null;
  }> = [];

  for (const tx of allTxRows) {
    if (!tx.externalId || !tx.accountId) continue;
    // Bank_transactions use signed amounts (negative for debit, positive for credit)
    const signedAmount = tx.type === 'debit' ? -tx.amount : tx.amount;
    bankTxRows.push({
      externalId: tx.externalId,
      accountId: tx.accountId,
      date: tx.date,
      amount: signedAmount,
      currency: tx.currency,
      type: tx.type,
      bankDescription: tx.bankDescription,
      counterparty: tx.counterparty,
      mcc: tx.mcc,
      commission: tx.commission,
    });
  }

  // Insert bank_transactions in batches
  const savedBankTxs: Array<{ id: number; externalId: string }> = [];
  for (let batchIdx = 0; batchIdx < bankTxRows.length; batchIdx += 50) {
    const batch = bankTxRows.slice(batchIdx, batchIdx + 50);
    const saved = await db.insert(bankTransactions).values(batch).returning();
    for (const row of saved) {
      savedBankTxs.push({ id: row.id, externalId: row.externalId });
    }
  }

  // Build externalId -> bankTx.id map
  const bankTxMap = new Map(savedBankTxs.map((bt) => [bt.externalId, bt.id]));

  // Create transaction_sources links
  const links: Array<{ transactionId: number; bankTransactionId: number }> = [];
  for (const tx of allTxRows) {
    if (!tx.externalId) continue;
    const bankTxId = bankTxMap.get(tx.externalId);
    if (bankTxId !== undefined) {
      links.push({ transactionId: tx.id, bankTransactionId: bankTxId });
    }
  }

  for (let batchIdx = 0; batchIdx < links.length; batchIdx += 50) {
    await db
      .insert(transactionSources)
      .values(links.slice(batchIdx, batchIdx + 50));
  }

  console.log(`  Inserted ${savedBankTxs.length} bank transactions`);
  console.log(`  Inserted ${links.length} transaction sources`);

  return bankTxMap;
}

async function seedTransferExamples(seedAccounts: SeedAccount[]) {
  console.log('Seeding transfer examples...');

  const blackAccount = seedAccounts.find((account) => account.role === 'operational');
  const whiteAccount = seedAccounts.find(
    (account) => account.role === 'operational' && account.id !== blackAccount?.id,
  );
  if (!blackAccount || !whiteAccount) {
    console.log('  Skipped: need at least 2 operational accounts');
    return;
  }

  let transferCount = 0;

  // 2 transfers per month for 3 months
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const year = monthOffset === 0 ? 2025 : 2026;
    const month = monthOffset === 0 ? 12 : monthOffset;

    for (let transferIdx = 0; transferIdx < 2; transferIdx++) {
      transferCount++;
      const day = transferIdx === 0 ? 10 : 25;
      const amount = transferIdx === 0 ? 500000 : 300000;
      const date = new Date(year, month - 1, day, 14, 30, 0);
      const datePlusMinute = new Date(date.getTime() + 60 * 1000);

      // Outgoing (debit) on Black
      const [outgoing] = await db
        .insert(transactions)
        .values({
          externalId: `seed-transfer-out-${transferCount}`,
          date,
          amount, // Positive — type indicates direction
          currency: 'UAH',
          type: 'transfer',
          accountId: blackAccount.id,
          accountExternalId: `mono-account-${blackAccount.id}`,
          bankDescription: 'Переказ на картку',
          counterparty: 'Mono White UAH',
          mcc: 0,
          categorizationStatus: 'verified',
        })
        .returning();

      // Incoming (credit) on White
      const [incoming] = await db
        .insert(transactions)
        .values({
          externalId: `seed-transfer-in-${transferCount}`,
          date: datePlusMinute,
          amount,
          currency: 'UAH',
          type: 'transfer',
          accountId: whiteAccount.id,
          accountExternalId: `mono-account-${whiteAccount.id}`,
          bankDescription: 'Від Mono Black UAH',
          counterparty: 'Mono Black UAH',
          mcc: 0,
          categorizationStatus: 'verified',
        })
        .returning();

      if (outgoing && incoming) {
        await db.insert(transferPairs).values({
          outgoingTransactionId: outgoing.id,
          incomingTransactionId: incoming.id,
        });

        // Create bank_transactions and transaction_sources for transfers
        // Bank_transactions use signed amounts (negative for debit, positive for credit)
        for (const tx of [outgoing, incoming]) {
          const isOutgoing = tx.id === outgoing.id;
          const bankAmount = isOutgoing ? -amount : amount;
          const [bankTx] = await db
            .insert(bankTransactions)
            .values({
              externalId: tx.externalId!,
              accountId: tx.accountId!,
              date: tx.date,
              amount: bankAmount,
              currency: tx.currency,
              type: isOutgoing ? 'debit' : 'credit',
              bankDescription: tx.bankDescription,
              counterparty: tx.counterparty,
              mcc: tx.mcc,
            })
            .returning();
          if (bankTx) {
            await db.insert(transactionSources).values({
              transactionId: tx.id,
              bankTransactionId: bankTx.id,
            });
          }
        }
      }
    }
  }

  console.log(`  Inserted ${transferCount * 2} transfer transactions + ${transferCount} transfer pairs`);
}

async function seedReturningExamples(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding returning/cancellation examples...');

  const account = seedAccounts.find((acc) => acc.role === 'operational');
  if (!account) return;

  const category = seedCategories.find((cat) => cat.parentId !== null);
  const budget = seedBudgets.find((bud) => !bud.cadenceUnit && !bud.targetDate);

  // Example 1: Partial refund — ONE debit transaction (positive, reduced amount)
  // linked to TWO bank_transactions (original debit + cancellation credit)
  const partialDate = new Date(2026, 0, 15, 10, 0, 0);
  const [partialOriginal] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-partial-original',
      date: partialDate,
      amount: 35000, // Positive. Was 50000, reduced by 15000 refund
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: `mono-account-${account.id}`,
      bankDescription: 'Glovo',
      counterparty: 'Glovo',
      mcc: 5812,
      categoryId: category?.id ?? null,
      budgetId: budget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  if (partialOriginal) {
    // Original debit bank_transaction
    const [originalBankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-partial-original',
        accountId: account.id,
        date: partialDate,
        amount: -50000, // Signed: negative debit
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Glovo',
        counterparty: 'Glovo',
        mcc: 5812,
      })
      .returning();

    // Cancellation credit bank_transaction
    const partialCancelDate = new Date(2026, 0, 17, 12, 0, 0);
    const [cancelBankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-partial-returning',
        accountId: account.id,
        date: partialCancelDate,
        amount: 15000, // Signed: positive credit
        currency: 'UAH',
        type: 'credit',
        bankDescription: 'Скасування. Glovo',
        counterparty: 'Glovo',
        mcc: 5812,
      })
      .returning();

    // Link both bank_transactions to the single transaction
    if (originalBankTx) {
      await db.insert(transactionSources).values({
        transactionId: partialOriginal.id,
        bankTransactionId: originalBankTx.id,
      });
    }
    if (cancelBankTx) {
      await db.insert(transactionSources).values({
        transactionId: partialOriginal.id,
        bankTransactionId: cancelBankTx.id,
      });
    }
  }

  // Example 2: Full refund — ZERO transactions, two orphaned bank_transactions
  const fullRefundDate = new Date(2026, 1, 5, 16, 0, 0);
  await db.insert(bankTransactions).values({
    externalId: 'seed-full-refund-original',
    accountId: account.id,
    date: fullRefundDate,
    amount: -25000,
    currency: 'UAH',
    type: 'debit',
    bankDescription: 'Amazon',
    counterparty: 'Amazon',
    mcc: 5942,
  });
  await db.insert(bankTransactions).values({
    externalId: 'seed-full-refund-cancel',
    accountId: account.id,
    date: new Date(2026, 1, 7, 10, 0, 0),
    amount: 25000,
    currency: 'UAH',
    type: 'credit',
    bankDescription: 'Скасування. Amazon',
    counterparty: 'Amazon',
    mcc: 5942,
  });

  console.log('  Inserted partial refund example (1 tx, 2 bank_txs) + full refund (0 txs, 2 orphaned bank_txs)');
}

async function seedFeeSplitExamples(seedAccounts: SeedAccount[]) {
  console.log('Seeding fee split examples...');

  const account = seedAccounts.find((acc) => acc.role === 'operational');
  if (!account) return;

  // Example 1: International purchase with commission
  const feeDate1 = new Date(2026, 0, 20, 15, 0, 0);
  const [mainTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-1',
      date: feeDate1,
      amount: 47500, // Positive. Original was 50000, reduced by 2500 commission
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: `mono-account-${account.id}`,
      bankDescription: 'Amazon.com',
      counterparty: 'Amazon',
      mcc: 5942,
      categorizationStatus: 'verified',
    })
    .returning();

  const [feeTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-1-fee',
      date: feeDate1,
      amount: 2500, // Positive
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: `mono-account-${account.id}`,
      bankDescription: 'Bank commission',
      mcc: 0,
      categorizationStatus: 'verified',
    })
    .returning();

  // Bank transaction for this fee split (signed amount with commission)
  const [bankTx1] = await db
    .insert(bankTransactions)
    .values({
      externalId: 'seed-fee-split-1',
      accountId: account.id,
      date: feeDate1,
      amount: -50000,
      currency: 'UAH',
      type: 'debit',
      bankDescription: 'Amazon.com',
      counterparty: 'Amazon',
      mcc: 5942,
      commission: 2500,
    })
    .returning();

  // Link both transactions to the same bank_transaction
  if (bankTx1 && mainTx1) {
    await db.insert(transactionSources).values({
      transactionId: mainTx1.id,
      bankTransactionId: bankTx1.id,
    });
  }
  if (bankTx1 && feeTx1) {
    await db.insert(transactionSources).values({
      transactionId: feeTx1.id,
      bankTransactionId: bankTx1.id,
    });
  }

  // Example 2: Another fee split
  const feeDate2 = new Date(2026, 1, 8, 11, 0, 0);
  const [mainTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-2',
      date: feeDate2,
      amount: 98500, // Positive. Original was 100000, reduced by 1500 commission
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: `mono-account-${account.id}`,
      bankDescription: 'Booking.com',
      counterparty: 'Booking',
      mcc: 7011,
      categorizationStatus: 'verified',
    })
    .returning();

  const [feeTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-2-fee',
      date: feeDate2,
      amount: 1500, // Positive
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: `mono-account-${account.id}`,
      bankDescription: 'Bank commission',
      mcc: 0,
      categorizationStatus: 'verified',
    })
    .returning();

  const [bankTx2] = await db
    .insert(bankTransactions)
    .values({
      externalId: 'seed-fee-split-2',
      accountId: account.id,
      date: feeDate2,
      amount: -100000,
      currency: 'UAH',
      type: 'debit',
      bankDescription: 'Booking.com',
      counterparty: 'Booking',
      mcc: 7011,
      commission: 1500,
    })
    .returning();

  if (bankTx2 && mainTx2) {
    await db.insert(transactionSources).values({
      transactionId: mainTx2.id,
      bankTransactionId: bankTx2.id,
    });
  }
  if (bankTx2 && feeTx2) {
    await db.insert(transactionSources).values({
      transactionId: feeTx2.id,
      bankTransactionId: bankTx2.id,
    });
  }

  console.log('  Inserted 2 fee split examples (4 transactions, 2 bank_transactions)');
}

async function seedManualTransactions(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding manual transactions...');

  // Find the manual Cash account
  const cashAccount = seedAccounts.find((acc) => acc.role === 'operational' && !seedAccounts.slice(0, 5).includes(acc));
  if (!cashAccount) {
    console.log('  Skipped: no manual account found');
    return;
  }

  const expenseCategories = seedCategories.filter(
    (cat) => cat.parentId !== null && !['Зарплата', 'Фріланс'].includes(cat.name),
  );
  const spendingBudgets = seedBudgets.filter((bud) => !bud.cadenceUnit && !bud.targetDate);

  const manualTxRows = [
    // Expenses
    {
      externalId: 'manual-txn-cash-1',
      date: new Date(2026, 0, 8, 12, 30, 0),
      amount: 15000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Кава з собою',
      counterparty: 'Coffee Point',
      categoryId: expenseCategories.find((cat) => cat.name === 'Кав\'ярня')?.id ?? expenseCategories[0]?.id ?? null,
      budgetId: spendingBudgets.find((bud) => bud.name === 'Ресторани та кав\'ярні')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-2',
      date: new Date(2026, 0, 12, 9, 0, 0),
      amount: 45000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Продукти на ринку',
      counterparty: 'Ринок',
      categoryId: expenseCategories.find((cat) => cat.name === 'Супермаркет')?.id ?? expenseCategories[0]?.id ?? null,
      budgetId: spendingBudgets.find((bud) => bud.name === 'Продукти')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-3',
      date: new Date(2026, 0, 18, 14, 0, 0),
      amount: 8000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Маршрутка',
      counterparty: 'Маршрутка',
      categoryId: expenseCategories.find((cat) => cat.name === 'Громадський транспорт')?.id ?? expenseCategories[0]?.id ?? null,
      budgetId: spendingBudgets.find((bud) => bud.name === 'Транспорт')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-4',
      date: new Date(2026, 1, 3, 11, 15, 0),
      amount: 65000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Обід в кафе',
      counterparty: 'Пузата Хата',
      categoryId: expenseCategories.find((cat) => cat.name === 'Ресторан')?.id ?? expenseCategories[0]?.id ?? null,
      budgetId: spendingBudgets.find((bud) => bud.name === 'Ресторани та кав\'ярні')?.id ?? null,
      categorizationStatus: 'pending',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-5',
      date: new Date(2026, 1, 10, 16, 45, 0),
      amount: 32000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Ліки',
      counterparty: 'Аптека',
      categoryId: expenseCategories.find((cat) => cat.name === 'Аптека')?.id ?? expenseCategories[0]?.id ?? null,
      budgetId: spendingBudgets.find((bud) => bud.name === 'Здоров\'я')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    // Income
    {
      externalId: 'manual-txn-cash-6',
      date: new Date(2026, 0, 25, 10, 0, 0),
      amount: 200000,
      currency: 'UAH',
      type: 'credit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Повернення боргу від друга',
      counterparty: 'Друг',
      categoryId: null,
      budgetId: null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-7',
      date: new Date(2026, 1, 15, 18, 0, 0),
      amount: 150000,
      currency: 'UAH',
      type: 'credit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Продаж речей на OLX',
      counterparty: 'OLX покупець',
      categoryId: null,
      budgetId: null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
  ];

  // Manual transactions have no bank_transaction or transaction_sources
  await db.insert(transactions).values(manualTxRows);

  console.log(`  Inserted ${manualTxRows.length} manual transactions on Cash UAH account`);
}

async function seedRules() {
  console.log('Seeding rules...');

  const catRules = await db
    .insert(categorizationRules)
    .values([
      {
        rule: "Assign all 'Bolt' and 'Uber' transactions to category 'Транспорт > Таксі'",
        priority: 10,
      },
      {
        rule: "Transactions with MCC 5411 (grocery stores) should be assigned to 'Їжа > Супермаркет'",
        priority: 5,
      },
      {
        rule: "Assign 'Netflix', 'Spotify', and 'YouTube Premium' transactions to 'Підписки'",
        priority: 5,
      },
      {
        rule: "Transactions from 'Сільпо', 'АТБ', 'Новус' are 'Їжа > Супермаркет'",
        priority: 3,
      },
    ])
    .returning();

  const budRules = await db
    .insert(budgetizationRules)
    .values([
      {
        rule: "Assign all 'Транспорт' category transactions to budget 'Транспорт'",
        priority: 10,
      },
      {
        rule: "Assign all 'Їжа' category transactions to budget 'Продукти'",
        priority: 10,
      },
      {
        rule: "Assign 'Підписки' category transactions to budget 'Підписки'",
        priority: 5,
      },
    ])
    .returning();

  console.log(`  Inserted ${catRules.length} categorization rules`);
  console.log(`  Inserted ${budRules.length} budgetization rules`);
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
    await seedBankTransactionsAndSources();
    await seedTransferExamples(seededAccounts);
    await seedReturningExamples(seededAccounts, seededCategories, seededBudgets);
    await seedFeeSplitExamples(seededAccounts);
    await seedManualTransactions(seededAccounts, seededCategories, seededBudgets);
    await seedRules();

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
