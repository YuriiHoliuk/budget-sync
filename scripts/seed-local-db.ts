/**
 * Seed Local Database
 *
 * Populates the local PostgreSQL database with realistic test data
 * for development and testing.
 *
 * Uses a seeded PRNG for deterministic, reproducible data across runs.
 *
 * Usage:
 *   DATABASE_URL=postgresql://budget_sync:budget_sync@localhost:5432/budget_sync bun run scripts/seed-local-db.ts
 *   just db-seed
 *
 * What this seed data demonstrates:
 * - Realistic merchant-category-budget alignment (Сільпо → Супермаркет → Продукти)
 * - Unique timestamps per transaction spread across realistic hours
 * - Amount ranges matching merchant types (subscriptions fixed, groceries variable)
 * - Multiple account types: monobank synced, manual bank, cash
 * - Auto-detected fee splits (international purchase + commission)
 * - Auto-detected returnings (partial and full refunds)
 * - Already-linked transfers between accounts
 * - Transfer candidates for manual conversion
 * - Returning candidates for manual mark-as-returning
 * - Manual split candidate (large receipt → multiple categories)
 * - Pending categorization transactions (recent, uncategorized)
 * - Budget target history and allocations across 3 months
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  accounts,
  allocations,
  bankTransactionReturns,
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

// ============================================================================
// Production Safety Guard
// ============================================================================

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

// ============================================================================
// Seeded PRNG — Linear Congruential Generator for deterministic "random" data
// ============================================================================

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = (this.state * 1664525 + 1013904223) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let idx = arr.length - 1; idx > 0; idx--) {
      const swapIdx = Math.floor(this.next() * (idx + 1));
      [arr[idx], arr[swapIdx]] = [arr[swapIdx]!, arr[idx]!];
    }
    return arr;
  }
}

const rng = new SeededRandom(20260222);

// ============================================================================
// Timestamp Tracker — ensures no duplicate timestamps
// ============================================================================

class TimestampTracker {
  private used = new Set<number>();

  /** Create a unique timestamp, offsetting by minutes if collision */
  unique(date: Date): Date {
    let ts = date.getTime();
    while (this.used.has(ts)) {
      ts += 60_000; // offset by 1 minute
    }
    this.used.add(ts);
    return new Date(ts);
  }
}

const timestamps = new TimestampTracker();

// ============================================================================
// Database Setup
// ============================================================================

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://budget_sync:budget_sync@localhost:5432/budget_sync';

assertNotProductionDatabase(DATABASE_URL);

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function clearDatabase() {
  console.log('Clearing existing data...');
  await db.execute(sql`TRUNCATE TABLE transfer_pairs, transaction_sources, bank_transaction_returns, bank_transactions, budget_targets, allocations, transactions, budgets, budget_groups, categories, accounts, categorization_rules, budgetization_rules RESTART IDENTITY CASCADE`);
}

// ============================================================================
// Merchant Templates — realistic counterparty-category-budget alignment
// ============================================================================

interface MerchantTemplate {
  counterparty: string;
  bankDescription: string;
  categoryName: string;
  budgetName: string;
  mcc: number;
  amountRange: [number, number]; // kopecks [min, max]
  timeRange: [number, number]; // hour of day [earliest, latest]
  monthlyFrequency: [number, number]; // [min, max] occurrences per month
  fixed?: boolean; // if true, amountRange[0] is used as exact amount
}

const EXPENSE_MERCHANTS: MerchantTemplate[] = [
  // Groceries — high frequency, variable amounts
  {
    counterparty: 'Сільпо',
    bankDescription: 'Сільпо',
    categoryName: 'Супермаркет',
    budgetName: 'Продукти',
    mcc: 5411,
    amountRange: [15000, 150000],
    timeRange: [10, 20],
    monthlyFrequency: [3, 4],
  },
  {
    counterparty: 'АТБ',
    bankDescription: 'АТБ-Маркет',
    categoryName: 'Супермаркет',
    budgetName: 'Продукти',
    mcc: 5411,
    amountRange: [8000, 60000],
    timeRange: [10, 20],
    monthlyFrequency: [3, 4],
  },
  {
    counterparty: 'Новус',
    bankDescription: 'NOVUS',
    categoryName: 'Супермаркет',
    budgetName: 'Продукти',
    mcc: 5411,
    amountRange: [20000, 200000],
    timeRange: [11, 19],
    monthlyFrequency: [1, 2],
  },

  // Restaurants & cafes
  {
    counterparty: "McDonald's",
    bankDescription: "McDonald's",
    categoryName: 'Ресторан',
    budgetName: 'Ресторани та кав\'ярні',
    mcc: 5812,
    amountRange: [15000, 40000],
    timeRange: [12, 21],
    monthlyFrequency: [2, 3],
  },
  {
    counterparty: 'Пузата Хата',
    bankDescription: 'Пузата Хата',
    categoryName: 'Ресторан',
    budgetName: 'Ресторани та кав\'ярні',
    mcc: 5812,
    amountRange: [12000, 25000],
    timeRange: [12, 15],
    monthlyFrequency: [1, 2],
  },
  {
    counterparty: 'Starbucks',
    bankDescription: 'Starbucks Coffee',
    categoryName: 'Кав\'ярня',
    budgetName: 'Ресторани та кав\'ярні',
    mcc: 5814,
    amountRange: [8000, 20000],
    timeRange: [7, 11],
    monthlyFrequency: [3, 4],
  },

  // Food delivery
  {
    counterparty: 'Glovo',
    bankDescription: 'Glovo',
    categoryName: 'Доставка їжі',
    budgetName: 'Продукти',
    mcc: 5812,
    amountRange: [20000, 50000],
    timeRange: [18, 22],
    monthlyFrequency: [2, 3],
  },

  // Transport
  {
    counterparty: 'Bolt',
    bankDescription: 'Bolt',
    categoryName: 'Таксі',
    budgetName: 'Транспорт',
    mcc: 4121,
    amountRange: [6000, 30000],
    timeRange: [8, 23],
    monthlyFrequency: [2, 3],
  },
  {
    counterparty: 'Uber',
    bankDescription: 'Uber',
    categoryName: 'Таксі',
    budgetName: 'Транспорт',
    mcc: 4121,
    amountRange: [8000, 35000],
    timeRange: [8, 23],
    monthlyFrequency: [1, 2],
  },
  {
    counterparty: 'ОККО',
    bankDescription: 'OKKO',
    categoryName: 'Пальне',
    budgetName: 'Транспорт',
    mcc: 5541,
    amountRange: [50000, 200000],
    timeRange: [7, 20],
    monthlyFrequency: [1, 2],
  },
  {
    counterparty: 'WOG',
    bankDescription: 'WOG',
    categoryName: 'Пальне',
    budgetName: 'Транспорт',
    mcc: 5541,
    amountRange: [40000, 180000],
    timeRange: [7, 20],
    monthlyFrequency: [0, 1],
  },

  // Utilities
  {
    counterparty: 'Київстар',
    bankDescription: 'Kyivstar',
    categoryName: 'Інтернет',
    budgetName: 'Комунальні послуги',
    mcc: 4814,
    amountRange: [25000, 35000],
    timeRange: [10, 18],
    monthlyFrequency: [1, 1],
  },

  // Entertainment
  {
    counterparty: 'Multiplex',
    bankDescription: 'Multiplex',
    categoryName: 'Кіно',
    budgetName: 'Розваги',
    mcc: 7832,
    amountRange: [20000, 40000],
    timeRange: [17, 22],
    monthlyFrequency: [0, 1],
  },
  {
    counterparty: 'Steam',
    bankDescription: 'STEAM PURCHASE',
    categoryName: 'Ігри',
    budgetName: 'Розваги',
    mcc: 5816,
    amountRange: [20000, 150000],
    timeRange: [10, 23],
    monthlyFrequency: [0, 1],
  },

  // Health
  {
    counterparty: 'Аптека АНЦ',
    bankDescription: 'Аптека АНЦ',
    categoryName: 'Аптека',
    budgetName: 'Здоров\'я',
    mcc: 5912,
    amountRange: [10000, 80000],
    timeRange: [9, 19],
    monthlyFrequency: [1, 2],
  },

  // Clothing — less frequent, higher amounts
  {
    counterparty: 'Zara',
    bankDescription: 'ZARA',
    categoryName: 'Одяг',
    budgetName: 'Одяг',
    mcc: 5651,
    amountRange: [50000, 500000],
    timeRange: [12, 19],
    monthlyFrequency: [0, 1],
  },
  {
    counterparty: 'H&M',
    bankDescription: 'H&M',
    categoryName: 'Одяг',
    budgetName: 'Одяг',
    mcc: 5651,
    amountRange: [30000, 300000],
    timeRange: [12, 19],
    monthlyFrequency: [0, 1],
  },

  // Subscriptions — fixed amounts, once per month
  {
    counterparty: 'Netflix',
    bankDescription: 'NETFLIX.COM',
    categoryName: 'Підписки',
    budgetName: 'Підписки',
    mcc: 5815,
    amountRange: [29900, 29900],
    timeRange: [2, 6],
    monthlyFrequency: [1, 1],
    fixed: true,
  },
  {
    counterparty: 'Spotify',
    bankDescription: 'SPOTIFY',
    categoryName: 'Підписки',
    budgetName: 'Підписки',
    mcc: 5815,
    amountRange: [16900, 16900],
    timeRange: [2, 6],
    monthlyFrequency: [1, 1],
    fixed: true,
  },
  {
    counterparty: 'YouTube Premium',
    bankDescription: 'GOOGLE *YouTube',
    categoryName: 'Підписки',
    budgetName: 'Підписки',
    mcc: 5815,
    amountRange: [9900, 9900],
    timeRange: [2, 6],
    monthlyFrequency: [1, 1],
    fixed: true,
  },
];

// ============================================================================
// Seed Functions
// ============================================================================

async function seedAccounts() {
  console.log('Seeding accounts...');
  return await db
    .insert(accounts)
    .values([
      // Monobank synced accounts (source defaults to 'bank_sync')
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
        type: 'fop',
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

      // Manual accounts (source: 'manual', no bank/iban/externalId)
      {
        name: 'Cash UAH',
        type: 'cash',
        currency: 'UAH',
        balance: 850000,
        role: 'operational',
        source: 'manual',
      },
      {
        name: 'PrivatBank UAH',
        type: 'debit',
        currency: 'UAH',
        balance: 2500000,
        role: 'operational',
        source: 'manual',
      },
    ])
    .returning();
}

async function seedCategories() {
  console.log('Seeding categories...');

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
      { name: 'Фінанси', status: 'active' },
      { name: 'Побут', status: 'active' },
    ])
    .returning();

  const parentMap = new Map(parents.map((parent) => [parent.name, parent.id]));

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
    // New: bank fees under Фінанси
    {
      name: 'Банківська комісія',
      parentId: parentMap.get('Фінанси'),
      status: 'active',
    },
    // New: household items under Побут
    {
      name: 'Побутові товари',
      parentId: parentMap.get('Побут'),
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
      // New: bank fees budget
      {
        name: 'Банківські комісії',
        currency: 'UAH',
        targetAmount: 5000,
        sortOrder: 'a9',
        budgetGroupId: billsId,
      },
      // Ungrouped budget
      {
        name: 'Інше',
        currency: 'UAH',
        targetAmount: 200000,
        sortOrder: 'aA',
      },
      // Goals & Savings group budgets
      {
        name: 'Фонд безпеки',
        currency: 'UAH',
        targetAmount: 500000,
        cap: 20000000,
        sortOrder: 'aB',
        budgetGroupId: goalsId,
      },
      {
        name: 'Відпустка',
        currency: 'UAH',
        targetAmount: 5000000,
        targetDate: '2026-07-01',
        sortOrder: 'aC',
        budgetGroupId: goalsId,
      },
      {
        name: 'Новий ноутбук',
        currency: 'UAH',
        targetAmount: 8000000,
        targetDate: '2026-12-01',
        sortOrder: 'aD',
        budgetGroupId: goalsId,
      },
      // Periodic budgets
      {
        name: 'Страховка авто',
        currency: 'UAH',
        targetAmount: 1200000,
        cadenceUnit: 'year',
        cadenceCount: 1,
        sortOrder: 'aE',
        budgetGroupId: billsId,
      },
      {
        name: 'Абонемент спортзалу',
        currency: 'UAH',
        targetAmount: 200000,
        cadenceUnit: 'week',
        cadenceCount: 2,
        sortOrder: 'aF',
        budgetGroupId: everydayId,
      },
      {
        name: 'Квартальний податок',
        currency: 'UAH',
        targetAmount: 900000,
        cadenceUnit: 'month',
        cadenceCount: 3,
        sortOrder: 'aG',
        budgetGroupId: billsId,
      },
      {
        name: 'Щоденні витрати на каву',
        currency: 'UAH',
        targetAmount: 10000,
        cadenceUnit: 'day',
        cadenceCount: 5,
        sortOrder: 'aH',
        budgetGroupId: everydayId,
      },
      {
        name: 'Погашення кредиту',
        currency: 'UAH',
        targetAmount: 500000,
        sortOrder: 'aI',
        budgetGroupId: billsId,
      },
    ])
    .returning();
}

// ============================================================================
// Type helpers
// ============================================================================

interface SeedAccount {
  id: number;
  name: string | null;
  role: string | null;
  source: string;
  externalId: string | null;
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

// ============================================================================
// Budget Targets & Allocations
// ============================================================================

async function seedBudgetTargets(seedBudgets: SeedBudget[]) {
  console.log('Seeding budget target history...');

  const produktyBudget = seedBudgets.find((budget) => budget.name === 'Продукти');
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
              : budget.name === 'Банківські комісії'
                ? 5000
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

// ============================================================================
// Transaction Generation — realistic merchant-based data
// ============================================================================

async function seedTransactions(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding transactions...');

  // Build lookup maps for category and budget resolution
  const categoryByName = new Map(seedCategories.map((cat) => [cat.name, cat]));
  const budgetByName = new Map(seedBudgets.map((bud) => [bud.name, bud]));

  // Primary spending account: Mono Black
  const blackAccount = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;

  const transactionRows: Array<{
    externalId: string;
    date: Date;
    amount: number;
    currency: string;
    type: string;
    accountId: number;
    accountExternalId: string;
    categoryId: number | null;
    budgetId: number | null;
    categorizationStatus: string;
    counterparty: string;
    bankDescription: string;
    mcc: number;
  }> = [];

  let txCounter = 0;

  // Generate expense transactions for 3 months: Dec 2025, Jan 2026, Feb 2026
  const months: Array<{ year: number; month: number }> = [
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ];

  for (const { year, month } of months) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrentMonth = year === 2026 && month === 2;

    // For each merchant, generate realistic number of transactions
    for (const merchant of EXPENSE_MERCHANTS) {
      const count = rng.int(merchant.monthlyFrequency[0], merchant.monthlyFrequency[1]);

      for (let idx = 0; idx < count; idx++) {
        txCounter++;

        // Subscriptions: always 1st–5th of month
        const day = merchant.fixed
          ? rng.int(1, 5)
          : rng.int(1, isCurrentMonth ? 20 : daysInMonth);

        const hour = rng.int(merchant.timeRange[0], merchant.timeRange[1]);
        const minute = rng.int(0, 59);
        const second = rng.int(0, 59);

        const date = timestamps.unique(
          new Date(year, month - 1, day, hour, minute, second),
        );

        const amount = merchant.fixed
          ? merchant.amountRange[0]
          : rng.int(merchant.amountRange[0], merchant.amountRange[1]);

        // Resolve category: use child category name, or parent if no child exists
        const category = categoryByName.get(merchant.categoryName);
        const budget = budgetByName.get(merchant.budgetName);

        transactionRows.push({
          externalId: `seed-tx-${txCounter}`,
          date,
          amount,
          currency: 'UAH',
          type: 'debit',
          accountId: blackAccount.id,
          accountExternalId: blackAccount.externalId!,
          categoryId: category?.id ?? null,
          budgetId: budget?.id ?? null,
          categorizationStatus: 'verified',
          counterparty: merchant.counterparty,
          bankDescription: merchant.bankDescription,
          mcc: merchant.mcc,
        });
      }
    }

    // Income: Salary on 5th, Freelance on ~20th
    const salaryCategory = categoryByName.get('Зарплата');
    const freelanceCategory = categoryByName.get('Фріланс');
    const fopAccount = seedAccounts.find((acc) => acc.name === 'FOP UAH')!;

    txCounter++;
    transactionRows.push({
      externalId: `seed-tx-${txCounter}`,
      date: timestamps.unique(new Date(year, month - 1, 5, 10, 0, 0)),
      amount: 7500000,
      currency: 'UAH',
      type: 'credit',
      accountId: fopAccount.id,
      accountExternalId: fopAccount.externalId!,
      categoryId: salaryCategory?.id ?? null,
      budgetId: null,
      categorizationStatus: 'verified',
      counterparty: 'ТОВ Роботодавець',
      bankDescription: 'Зарплата за місяць',
      mcc: 0,
    });

    txCounter++;
    transactionRows.push({
      externalId: `seed-tx-${txCounter}`,
      date: timestamps.unique(new Date(year, month - 1, 20, 14, 30, 0)),
      amount: 3500000,
      currency: 'UAH',
      type: 'credit',
      accountId: fopAccount.id,
      accountExternalId: fopAccount.externalId!,
      categoryId: freelanceCategory?.id ?? null,
      budgetId: null,
      categorizationStatus: 'verified',
      counterparty: 'Upwork',
      bankDescription: 'Оплата за фріланс проект',
      mcc: 0,
    });
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
  return txCounter;
}

// ============================================================================
// Bank Transactions & Sources — create bank_transaction for each transaction
// ============================================================================

async function seedBankTransactionsAndSources() {
  console.log('Seeding bank transactions and transaction sources...');

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

  const savedBankTxs: Array<{ id: number; externalId: string }> = [];
  for (let batchIdx = 0; batchIdx < bankTxRows.length; batchIdx += 50) {
    const batch = bankTxRows.slice(batchIdx, batchIdx + 50);
    const saved = await db.insert(bankTransactions).values(batch).returning();
    for (const row of saved) {
      savedBankTxs.push({ id: row.id, externalId: row.externalId });
    }
  }

  const bankTxMap = new Map(savedBankTxs.map((bt) => [bt.externalId, bt.id]));

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

// ============================================================================
// Pending Categorization — recent uncategorized transactions (Feb 2026)
// ============================================================================

async function seedPendingTransactions(
  seedAccounts: SeedAccount[],
) {
  console.log('Seeding pending categorization transactions...');

  const blackAccount = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;

  const pendingMerchants = [
    { counterparty: 'Сільпо', desc: 'Сільпо', mcc: 5411 },
    { counterparty: 'Bolt', desc: 'Bolt', mcc: 4121 },
    { counterparty: 'Нова Пошта', desc: 'Nova Poshta', mcc: 4215 },
    { counterparty: 'Rozetka', desc: 'ROZETKA', mcc: 5734 },
    { counterparty: 'Аптека Подорожник', desc: 'Подорожник', mcc: 5912 },
    { counterparty: 'Comfy', desc: 'COMFY', mcc: 5732 },
  ];

  const txRows: Array<{
    externalId: string;
    date: Date;
    amount: number;
    currency: string;
    type: string;
    accountId: number;
    accountExternalId: string;
    categorizationStatus: string;
    counterparty: string;
    bankDescription: string;
    mcc: number;
  }> = [];

  for (let idx = 0; idx < pendingMerchants.length; idx++) {
    const merchant = pendingMerchants[idx]!;
    const day = 15 + idx;
    const date = timestamps.unique(
      new Date(2026, 1, day, rng.int(9, 20), rng.int(0, 59), rng.int(0, 59)),
    );

    txRows.push({
      externalId: `seed-pending-${idx + 1}`,
      date,
      amount: rng.int(5000, 150000),
      currency: 'UAH',
      type: 'debit',
      accountId: blackAccount.id,
      accountExternalId: blackAccount.externalId!,
      categorizationStatus: 'pending',
      counterparty: merchant.counterparty,
      bankDescription: merchant.desc,
      mcc: merchant.mcc,
    });
  }

  const saved = await db.insert(transactions).values(txRows).returning();

  // Create corresponding bank_transactions
  for (const tx of saved) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: tx.externalId!,
        accountId: tx.accountId!,
        date: tx.date,
        amount: -tx.amount,
        currency: tx.currency,
        type: 'debit',
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

  console.log(`  Inserted ${saved.length} pending transactions`);
}

// ============================================================================
// Transfer Examples — already linked transfers between accounts
// ============================================================================

async function seedTransferExamples(seedAccounts: SeedAccount[]) {
  console.log('Seeding transfer examples...');

  const blackAccount = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const whiteAccount = seedAccounts.find((acc) => acc.name === 'Mono White UAH')!;
  const savingsAccount = seedAccounts.find((acc) => acc.name === 'Savings UAH')!;

  const transferPairDefs = [
    // Black → White transfers
    { from: blackAccount, to: whiteAccount, amount: 500000, year: 2025, month: 12, day: 10 },
    { from: blackAccount, to: whiteAccount, amount: 300000, year: 2025, month: 12, day: 25 },
    { from: blackAccount, to: whiteAccount, amount: 500000, year: 2026, month: 1, day: 10 },
    { from: blackAccount, to: whiteAccount, amount: 300000, year: 2026, month: 1, day: 25 },
    // Black → Savings
    { from: blackAccount, to: savingsAccount, amount: 1000000, year: 2026, month: 1, day: 5 },
    { from: blackAccount, to: savingsAccount, amount: 1000000, year: 2026, month: 2, day: 5 },
  ];

  let transferCount = 0;
  for (const def of transferPairDefs) {
    transferCount++;
    const date = timestamps.unique(new Date(def.year, def.month - 1, def.day, 14, 30, 0));
    const datePlusMinute = new Date(date.getTime() + 60_000);

    const [outgoing] = await db
      .insert(transactions)
      .values({
        externalId: `seed-transfer-out-${transferCount}`,
        date,
        amount: def.amount,
        currency: 'UAH',
        type: 'transfer',
        accountId: def.from.id,
        accountExternalId: def.from.externalId!,
        bankDescription: `Переказ на ${def.to.name}`,
        counterparty: def.to.name,
        mcc: 0,
        categorizationStatus: 'verified',
      })
      .returning();

    const [incoming] = await db
      .insert(transactions)
      .values({
        externalId: `seed-transfer-in-${transferCount}`,
        date: datePlusMinute,
        amount: def.amount,
        currency: 'UAH',
        type: 'transfer',
        accountId: def.to.id,
        accountExternalId: def.to.externalId ?? def.to.id.toString(),
        bankDescription: `Від ${def.from.name}`,
        counterparty: def.from.name,
        mcc: 0,
        categorizationStatus: 'verified',
      })
      .returning();

    if (outgoing && incoming) {
      await db.insert(transferPairs).values({
        outgoingTransactionId: outgoing.id,
        incomingTransactionId: incoming.id,
      });

      for (const tx of [outgoing, incoming]) {
        const isOutgoing = tx.id === outgoing.id;
        const bankAmount = isOutgoing ? -def.amount : def.amount;
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

  console.log(`  Inserted ${transferCount * 2} transfer transactions + ${transferCount} transfer pairs`);
}

// ============================================================================
// Returning Examples — auto-detected partial and full refunds
// ============================================================================

async function seedReturningExamples(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding returning/cancellation examples...');

  const account = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const deliveryCategory = seedCategories.find((cat) => cat.name === 'Доставка їжі');
  const foodBudget = seedBudgets.find((bud) => bud.name === 'Продукти');

  // --- Example 1: Partial refund ---
  // Glovo order 500 UAH, then cancellation credit 150 UAH 2 days later
  // Results in one transaction of 350 UAH linked to two bank_transactions
  const partialDate = timestamps.unique(new Date(2026, 0, 15, 19, 45, 0));
  const [partialTx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-partial-original',
      date: partialDate,
      amount: 35000, // 500 - 150 = 350 UAH
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Glovo',
      counterparty: 'Glovo',
      mcc: 5812,
      categoryId: deliveryCategory?.id ?? null,
      budgetId: foodBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  if (partialTx) {
    const [originalBankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-partial-original',
        accountId: account.id,
        date: partialDate,
        amount: -50000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Glovo',
        counterparty: 'Glovo',
        mcc: 5812,
      })
      .returning();

    const partialCancelDate = timestamps.unique(new Date(2026, 0, 17, 12, 0, 0));
    const [cancelBankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-partial-returning',
        accountId: account.id,
        date: partialCancelDate,
        amount: 15000,
        currency: 'UAH',
        type: 'credit',
        bankDescription: 'Скасування. Glovo',
        counterparty: 'Glovo',
        mcc: 5812,
      })
      .returning();

    if (originalBankTx) {
      await db.insert(transactionSources).values({
        transactionId: partialTx.id,
        bankTransactionId: originalBankTx.id,
      });
    }
    if (cancelBankTx) {
      await db.insert(transactionSources).values({
        transactionId: partialTx.id,
        bankTransactionId: cancelBankTx.id,
      });
    }
    // Record the return relationship in audit trail
    if (originalBankTx && cancelBankTx) {
      await db.insert(bankTransactionReturns).values({
        originalBankTransactionId: originalBankTx.id,
        returningBankTransactionId: cancelBankTx.id,
        amount: 15000,
      });
    }
  }

  // --- Example 2: Full refund ---
  // Amazon 250 UAH purchase, then exact refund → zero transactions, two orphaned bank_transactions
  const fullRefundDate = timestamps.unique(new Date(2026, 1, 5, 16, 0, 0));
  const [fullRefundOriginalBankTx] = await db.insert(bankTransactions).values({
    externalId: 'seed-full-refund-original',
    accountId: account.id,
    date: fullRefundDate,
    amount: -25000,
    currency: 'UAH',
    type: 'debit',
    bankDescription: 'Amazon',
    counterparty: 'Amazon',
    mcc: 5942,
  }).returning();
  const [fullRefundCancelBankTx] = await db.insert(bankTransactions).values({
    externalId: 'seed-full-refund-cancel',
    accountId: account.id,
    date: timestamps.unique(new Date(2026, 1, 7, 10, 0, 0)),
    amount: 25000,
    currency: 'UAH',
    type: 'credit',
    bankDescription: 'Скасування. Amazon',
    counterparty: 'Amazon',
    mcc: 5942,
  }).returning();

  // Record the full refund return relationship in audit trail
  if (fullRefundOriginalBankTx && fullRefundCancelBankTx) {
    await db.insert(bankTransactionReturns).values({
      originalBankTransactionId: fullRefundOriginalBankTx.id,
      returningBankTransactionId: fullRefundCancelBankTx.id,
      amount: 25000,
    });
  }

  console.log('  Inserted partial refund (1 tx, 2 bank_txs) + full refund (0 txs, 2 orphaned bank_txs)');

  // --- Example 3: Cross-account returning candidates (unpaired) ---
  // Two unpaired transactions on different accounts that the user can manually
  // pair via the "mark as returning" flow to demonstrate cross-account support.
  // Scenario: pub dinner paid from Mono Black, friend reimbursed to Mono White.
  const otherAccount = seedAccounts.find((acc) => acc.name === 'Mono White UAH');
  const diningCategory = seedCategories.find((cat) => cat.name === 'Ресторани');

  if (otherAccount) {
    const pubDate = timestamps.unique(new Date(2026, 2, 3, 20, 15, 0));
    await db.insert(transactions).values({
      externalId: 'seed-cross-account-pub',
      date: pubDate,
      amount: 120000, // 1200 UAH — user paid the full bill
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Pub Pravda',
      counterparty: 'Pub Pravda',
      mcc: 5812,
      categoryId: diningCategory?.id ?? null,
      categorizationStatus: 'verified',
    });

    const friendDate = timestamps.unique(new Date(2026, 2, 3, 22, 30, 0));
    await db.insert(transactions).values({
      externalId: 'seed-cross-account-friend-refund',
      date: friendDate,
      amount: 40000, // 400 UAH — friend's share on a different card
      currency: 'UAH',
      type: 'credit',
      accountId: otherAccount.id,
      accountExternalId: otherAccount.externalId!,
      bankDescription: 'P2P Refund',
      counterparty: 'Friend',
      categorizationStatus: 'verified',
    });

    console.log(
      '  Inserted cross-account returning candidates (1 debit on Mono Black, 1 credit on Mono White) — pair manually in UI to demo',
    );
  }
}

// ============================================================================
// Fee Split Examples — international purchases with bank commission
// ============================================================================

async function seedFeeSplitExamples(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding fee split examples...');

  const account = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const clothingCategory = seedCategories.find((cat) => cat.name === 'Одяг');
  const clothingBudget = seedBudgets.find((bud) => bud.name === 'Одяг');
  const feeCategory = seedCategories.find((cat) => cat.name === 'Банківська комісія');
  const feeBudget = seedBudgets.find((bud) => bud.name === 'Банківські комісії');

  // --- Example 1: Amazon.com — 500 UAH purchase, 25 UAH commission ---
  const feeDate1 = timestamps.unique(new Date(2026, 0, 20, 15, 0, 0));
  const [mainTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-1',
      date: feeDate1,
      amount: 47500,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Amazon.com',
      counterparty: 'Amazon',
      mcc: 5651,
      categoryId: clothingCategory?.id ?? null,
      budgetId: clothingBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  const [feeTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-1-fee',
      date: feeDate1,
      amount: 2500,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Комісія за міжнародний переказ',
      mcc: 0,
      categoryId: feeCategory?.id ?? null,
      budgetId: feeBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

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
      mcc: 5651,
      commission: 2500,
    })
    .returning();

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

  // --- Example 2: Booking.com — 1000 UAH hotel, 15 UAH commission ---
  const feeDate2 = timestamps.unique(new Date(2026, 1, 8, 11, 0, 0));
  const [mainTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-fee-split-2',
      date: feeDate2,
      amount: 98500,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
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
      amount: 1500,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Комісія за міжнародний переказ',
      mcc: 0,
      categoryId: feeCategory?.id ?? null,
      budgetId: feeBudget?.id ?? null,
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

// ============================================================================
// Split Transaction Example — one bank_tx split into multiple transactions
// ============================================================================

async function seedSplitTransactionExample(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding split transaction example...');

  const account = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const supermarketCategory = seedCategories.find((cat) => cat.name === 'Супермаркет');
  const householdCategory = seedCategories.find((cat) => cat.name === 'Побутові товари');
  const pharmacyCategory = seedCategories.find((cat) => cat.name === 'Аптека');
  const foodBudget = seedBudgets.find((bud) => bud.name === 'Продукти');
  const healthBudget = seedBudgets.find((bud) => bud.name === 'Здоров\'я');
  const otherBudget = seedBudgets.find((bud) => bud.name === 'Інше');

  const splitDate = timestamps.unique(new Date(2026, 0, 22, 16, 30, 0));

  // Bank transaction: 500 UAH grocery receipt
  const [bankTx] = await db
    .insert(bankTransactions)
    .values({
      externalId: 'seed-split-grocery-original',
      accountId: account.id,
      date: splitDate,
      amount: -50000,
      currency: 'UAH',
      type: 'debit',
      bankDescription: 'Сільпо',
      counterparty: 'Сільпо',
      mcc: 5411,
    })
    .returning();

  if (!bankTx) return;

  // Split into 3 transactions: food (200 UAH) + household (150 UAH) + personal care (150 UAH)
  const [remainingTx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-split-grocery-original',
      date: splitDate,
      amount: 20000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Сільпо',
      counterparty: 'Сільпо',
      mcc: 5411,
      categoryId: supermarketCategory?.id ?? null,
      budgetId: foodBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  const [splitTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'split-seed-grocery-1',
      date: splitDate,
      amount: 15000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Сільпо — побутові товари',
      counterparty: 'Сільпо',
      mcc: 5411,
      categoryId: householdCategory?.id ?? null,
      budgetId: otherBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  const [splitTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'split-seed-grocery-2',
      date: splitDate,
      amount: 15000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Сільпо — засоби гігієни',
      counterparty: 'Сільпо',
      mcc: 5411,
      categoryId: pharmacyCategory?.id ?? null,
      budgetId: healthBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  const splitTransactions = [remainingTx, splitTx1, splitTx2].filter(Boolean);
  for (const tx of splitTransactions) {
    if (tx) {
      await db.insert(transactionSources).values({
        transactionId: tx.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  console.log(`  Inserted 1 bank transaction, ${splitTransactions.length} split transactions`);
}

// ============================================================================
// Manual Split Candidate — large single transaction user can manually split
// ============================================================================

async function seedManualSplitCandidate(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding manual split candidate...');

  const account = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const supermarketCategory = seedCategories.find((cat) => cat.name === 'Супермаркет');
  const foodBudget = seedBudgets.find((bud) => bud.name === 'Продукти');

  const date = timestamps.unique(new Date(2026, 1, 12, 15, 20, 0));

  // Large Сільпо purchase (1200 UAH) — user can split into groceries + household
  const [tx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-manual-split-candidate',
      date,
      amount: 120000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Сільпо',
      counterparty: 'Сільпо',
      mcc: 5411,
      categoryId: supermarketCategory?.id ?? null,
      budgetId: foodBudget?.id ?? null,
      categorizationStatus: 'verified',
    })
    .returning();

  if (tx) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-manual-split-candidate',
        accountId: account.id,
        date,
        amount: -120000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Сільпо',
        counterparty: 'Сільпо',
        mcc: 5411,
      })
      .returning();

    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: tx.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  console.log('  Inserted 1 manual split candidate (1200 UAH Сільпо)');
}

// ============================================================================
// Transfer Candidates — unlinked debit/credit pairs for manual conversion
// ============================================================================

async function seedTransferCandidates(seedAccounts: SeedAccount[]) {
  console.log('Seeding transfer candidates...');

  const blackAccount = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;
  const privatAccount = seedAccounts.find((acc) => acc.name === 'PrivatBank UAH')!;
  const cashAccount = seedAccounts.find((acc) => acc.name === 'Cash UAH')!;

  // --- Candidate 1: Black → PrivatBank (10000 UAH) ---
  // Outgoing on Black
  const outDate1 = timestamps.unique(new Date(2026, 0, 15, 11, 0, 0));
  const [outTx1] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-transfer-candidate-out-1',
      date: outDate1,
      amount: 1000000,
      currency: 'UAH',
      type: 'debit',
      accountId: blackAccount.id,
      accountExternalId: blackAccount.externalId!,
      bankDescription: 'Переказ на PrivatBank',
      counterparty: 'Переказ',
      mcc: 0,
      categorizationStatus: 'verified',
    })
    .returning();

  if (outTx1) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-transfer-candidate-out-1',
        accountId: blackAccount.id,
        date: outDate1,
        amount: -1000000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Переказ на PrivatBank',
        counterparty: 'Переказ',
        mcc: 0,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: outTx1.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  // Incoming on PrivatBank (manual account — no bank_transaction)
  await db.insert(transactions).values({
    externalId: 'seed-transfer-candidate-in-1',
    date: timestamps.unique(new Date(2026, 0, 15, 11, 5, 0)),
    amount: 1000000,
    currency: 'UAH',
    type: 'credit',
    accountId: privatAccount.id,
    accountExternalId: privatAccount.id.toString(),
    bankDescription: 'Поповнення',
    counterparty: 'Mono Black',
    mcc: 0,
    categorizationStatus: 'verified',
  });

  // --- Candidate 2: Black → Cash (ATM withdrawal, 5000 UAH) ---
  const outDate2 = timestamps.unique(new Date(2026, 1, 3, 18, 30, 0));
  const [outTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-transfer-candidate-out-2',
      date: outDate2,
      amount: 500000,
      currency: 'UAH',
      type: 'debit',
      accountId: blackAccount.id,
      accountExternalId: blackAccount.externalId!,
      bankDescription: 'Зняття готівки',
      counterparty: 'ATM',
      mcc: 6011,
      categorizationStatus: 'verified',
    })
    .returning();

  if (outTx2) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-transfer-candidate-out-2',
        accountId: blackAccount.id,
        date: outDate2,
        amount: -500000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Зняття готівки',
        counterparty: 'ATM',
        mcc: 6011,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: outTx2.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  // Incoming on Cash (manual account)
  await db.insert(transactions).values({
    externalId: 'seed-transfer-candidate-in-2',
    date: timestamps.unique(new Date(2026, 1, 3, 18, 35, 0)),
    amount: 500000,
    currency: 'UAH',
    type: 'credit',
    accountId: cashAccount.id,
    accountExternalId: cashAccount.id.toString(),
    bankDescription: 'Зняття з банкомату',
    counterparty: 'Mono Black',
    mcc: 0,
    categorizationStatus: 'verified',
  });

  console.log('  Inserted 2 transfer candidate pairs (4 transactions)');
}

// ============================================================================
// Returning Candidates — unlinked expense/credit pairs for manual linking
// ============================================================================

async function seedReturningCandidates(seedAccounts: SeedAccount[]) {
  console.log('Seeding returning candidates...');

  const account = seedAccounts.find((acc) => acc.name === 'Mono Black UAH')!;

  // --- Candidate 1: Restaurant dinner (1800 UAH) + friend's repayment (900 UAH) ---
  const dinnerDate = timestamps.unique(new Date(2026, 0, 20, 20, 0, 0));
  const [dinnerTx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-returning-candidate-expense-1',
      date: dinnerDate,
      amount: 180000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Ресторан Канапа',
      counterparty: 'Ресторан Канапа',
      mcc: 5812,
      categorizationStatus: 'verified',
    })
    .returning();

  if (dinnerTx) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-returning-candidate-expense-1',
        accountId: account.id,
        date: dinnerDate,
        amount: -180000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Ресторан Канапа',
        counterparty: 'Ресторан Канапа',
        mcc: 5812,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: dinnerTx.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  // Friend sends half back (900 UAH)
  const repayDate = timestamps.unique(new Date(2026, 0, 22, 14, 0, 0));
  const [repayTx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-returning-candidate-credit-1',
      date: repayDate,
      amount: 90000,
      currency: 'UAH',
      type: 'credit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Від Андрія',
      counterparty: 'Андрій',
      mcc: 0,
      categorizationStatus: 'verified',
    })
    .returning();

  if (repayTx) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-returning-candidate-credit-1',
        accountId: account.id,
        date: repayDate,
        amount: 90000,
        currency: 'UAH',
        type: 'credit',
        bankDescription: 'Від Андрія',
        counterparty: 'Андрій',
        mcc: 0,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: repayTx.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  // --- Candidate 2: Gift (500 UAH) + full repayment (500 UAH) ---
  const giftDate = timestamps.unique(new Date(2026, 1, 1, 13, 0, 0));
  const [giftTx] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-returning-candidate-expense-2',
      date: giftDate,
      amount: 50000,
      currency: 'UAH',
      type: 'debit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Подарунок',
      counterparty: 'Подарунок',
      mcc: 5947,
      categorizationStatus: 'verified',
    })
    .returning();

  if (giftTx) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-returning-candidate-expense-2',
        accountId: account.id,
        date: giftDate,
        amount: -50000,
        currency: 'UAH',
        type: 'debit',
        bankDescription: 'Подарунок',
        counterparty: 'Подарунок',
        mcc: 5947,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: giftTx.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  // Full repayment from Марія
  const repayDate2 = timestamps.unique(new Date(2026, 1, 3, 10, 0, 0));
  const [repayTx2] = await db
    .insert(transactions)
    .values({
      externalId: 'seed-returning-candidate-credit-2',
      date: repayDate2,
      amount: 50000,
      currency: 'UAH',
      type: 'credit',
      accountId: account.id,
      accountExternalId: account.externalId!,
      bankDescription: 'Від Марії',
      counterparty: 'Марія',
      mcc: 0,
      categorizationStatus: 'verified',
    })
    .returning();

  if (repayTx2) {
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        externalId: 'seed-returning-candidate-credit-2',
        accountId: account.id,
        date: repayDate2,
        amount: 50000,
        currency: 'UAH',
        type: 'credit',
        bankDescription: 'Від Марії',
        counterparty: 'Марія',
        mcc: 0,
      })
      .returning();
    if (bankTx) {
      await db.insert(transactionSources).values({
        transactionId: repayTx2.id,
        bankTransactionId: bankTx.id,
      });
    }
  }

  console.log('  Inserted 2 returning candidate pairs (4 transactions)');
}

// ============================================================================
// Manual Transactions — on Cash UAH and PrivatBank accounts (no bank_tx)
// ============================================================================

async function seedManualTransactions(
  seedAccounts: SeedAccount[],
  seedCategories: SeedCategory[],
  seedBudgets: SeedBudget[],
) {
  console.log('Seeding manual transactions...');

  const cashAccount = seedAccounts.find((acc) => acc.name === 'Cash UAH')!;
  const privatAccount = seedAccounts.find((acc) => acc.name === 'PrivatBank UAH')!;

  const categoryByName = new Map(seedCategories.map((cat) => [cat.name, cat]));
  const budgetByName = new Map(seedBudgets.map((bud) => [bud.name, bud]));

  const manualTxRows = [
    // Cash expenses
    {
      externalId: 'manual-txn-cash-1',
      date: timestamps.unique(new Date(2026, 0, 8, 12, 30, 0)),
      amount: 15000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Кава з собою',
      counterparty: 'Coffee Point',
      categoryId: categoryByName.get('Кав\'ярня')?.id ?? null,
      budgetId: budgetByName.get('Ресторани та кав\'ярні')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-2',
      date: timestamps.unique(new Date(2026, 0, 12, 9, 0, 0)),
      amount: 45000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Продукти на ринку',
      counterparty: 'Ринок',
      categoryId: categoryByName.get('Супермаркет')?.id ?? null,
      budgetId: budgetByName.get('Продукти')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-3',
      date: timestamps.unique(new Date(2026, 0, 18, 14, 0, 0)),
      amount: 8000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Маршрутка',
      counterparty: 'Маршрутка',
      categoryId: categoryByName.get('Громадський транспорт')?.id ?? null,
      budgetId: budgetByName.get('Транспорт')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-4',
      date: timestamps.unique(new Date(2026, 1, 3, 11, 15, 0)),
      amount: 65000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Обід в кафе',
      counterparty: 'Пузата Хата',
      categoryId: categoryByName.get('Ресторан')?.id ?? null,
      budgetId: budgetByName.get('Ресторани та кав\'ярні')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-cash-5',
      date: timestamps.unique(new Date(2026, 1, 10, 16, 45, 0)),
      amount: 32000,
      currency: 'UAH',
      type: 'debit',
      accountId: cashAccount.id,
      accountExternalId: cashAccount.id.toString(),
      bankDescription: 'Ліки',
      counterparty: 'Аптека',
      categoryId: categoryByName.get('Аптека')?.id ?? null,
      budgetId: budgetByName.get('Здоров\'я')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    // Cash income
    {
      externalId: 'manual-txn-cash-6',
      date: timestamps.unique(new Date(2026, 0, 25, 10, 0, 0)),
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
      date: timestamps.unique(new Date(2026, 1, 15, 18, 0, 0)),
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

    // PrivatBank expenses
    {
      externalId: 'manual-txn-privat-1',
      date: timestamps.unique(new Date(2025, 11, 15, 10, 0, 0)),
      amount: 350000,
      currency: 'UAH',
      type: 'debit',
      accountId: privatAccount.id,
      accountExternalId: privatAccount.id.toString(),
      bankDescription: 'Комунальні послуги',
      counterparty: 'ДТЕК',
      categoryId: categoryByName.get('Комунальні')?.id ?? null,
      budgetId: budgetByName.get('Комунальні послуги')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-privat-2',
      date: timestamps.unique(new Date(2026, 0, 15, 10, 0, 0)),
      amount: 380000,
      currency: 'UAH',
      type: 'debit',
      accountId: privatAccount.id,
      accountExternalId: privatAccount.id.toString(),
      bankDescription: 'Комунальні послуги',
      counterparty: 'ДТЕК',
      categoryId: categoryByName.get('Комунальні')?.id ?? null,
      budgetId: budgetByName.get('Комунальні послуги')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
    {
      externalId: 'manual-txn-privat-3',
      date: timestamps.unique(new Date(2026, 1, 15, 10, 0, 0)),
      amount: 320000,
      currency: 'UAH',
      type: 'debit',
      accountId: privatAccount.id,
      accountExternalId: privatAccount.id.toString(),
      bankDescription: 'Комунальні послуги',
      counterparty: 'ДТЕК',
      categoryId: categoryByName.get('Комунальні')?.id ?? null,
      budgetId: budgetByName.get('Комунальні послуги')?.id ?? null,
      categorizationStatus: 'verified',
      mcc: 0,
    },
  ];

  await db.insert(transactions).values(manualTxRows);

  console.log(`  Inserted ${manualTxRows.length} manual transactions`);
}

// ============================================================================
// Rules — categorization and budgetization
// ============================================================================

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
      {
        rule: "Transactions with commission > 0 should create a split with 'Фінанси > Банківська комісія' category",
        priority: 8,
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
      {
        rule: "Assign 'Фінанси > Банківська комісія' transactions to budget 'Банківські комісії'",
        priority: 8,
      },
    ])
    .returning();

  console.log(`  Inserted ${catRules.length} categorization rules`);
  console.log(`  Inserted ${budRules.length} budgetization rules`);
}

// ============================================================================
// Main
// ============================================================================

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

    // Core transactions: merchant-template based expenses + income
    await seedTransactions(seededAccounts, seededCategories, seededBudgets);
    await seedBankTransactionsAndSources();

    // Pending categorization (recent uncategorized transactions)
    await seedPendingTransactions(seededAccounts);

    // Already-linked transfers
    await seedTransferExamples(seededAccounts);

    // Auto-detected returnings (partial + full refund)
    await seedReturningExamples(seededAccounts, seededCategories, seededBudgets);

    // Auto-detected fee splits (international purchase + commission)
    await seedFeeSplitExamples(seededAccounts, seededCategories, seededBudgets);

    // Already-split transaction example (1 bank_tx → 3 transactions)
    await seedSplitTransactionExample(seededAccounts, seededCategories, seededBudgets);

    // Manual split candidate (large receipt for user to split)
    await seedManualSplitCandidate(seededAccounts, seededCategories, seededBudgets);

    // Transfer candidates (unlinked debit/credit pairs for manual conversion)
    await seedTransferCandidates(seededAccounts);

    // Returning candidates (expense + repayment for manual mark-as-returning)
    await seedReturningCandidates(seededAccounts);

    // Manual transactions on Cash and PrivatBank accounts
    await seedManualTransactions(seededAccounts, seededCategories, seededBudgets);

    // Rules
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
