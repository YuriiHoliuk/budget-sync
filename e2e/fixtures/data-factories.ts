/**
 * E2E Test Data Factories
 *
 * These factories create test data via GraphQL mutations.
 * Unlike unit test factories that use direct database access,
 * E2E factories interact through the API to test the full stack.
 */

const API_BASE_URL = 'http://localhost:4002';
const GRAPHQL_ENDPOINT = `${API_BASE_URL}/graphql`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function executeGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<GraphQLResponse<T>>;
}

/**
 * Budget creation via GraphQL
 */
interface CreateBudgetInput {
  name: string;
  type: 'SPENDING' | 'SAVINGS' | 'GOAL';
  currency?: string;
  targetAmount?: number;
  targetCadence?: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  targetCadenceMonths?: number;
  targetDate?: string;
  startDate?: string;
  endDate?: string;
}

interface Budget {
  id: number;
  name: string;
  type: string;
  currency: string;
  targetAmount: number | null;
}

export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  const mutation = `
    mutation CreateBudget($input: CreateBudgetInput!) {
      createBudget(input: $input) {
        id
        name
        type
        currency
        targetAmount
      }
    }
  `;

  const result = await executeGraphQL<{ createBudget: Budget }>(mutation, {
    input: {
      ...input,
      currency: input.currency ?? 'UAH',
    },
  });

  if (result.errors) {
    throw new Error(`Failed to create budget: ${result.errors[0].message}`);
  }

  if (!result.data?.createBudget) {
    throw new Error('No budget returned from mutation');
  }

  return result.data.createBudget;
}

/**
 * Category creation via GraphQL
 */
interface CreateCategoryInput {
  name: string;
  parentId?: number;
}

interface Category {
  id: number;
  name: string;
  status: string;
  parentId: number | null;
}

export async function createCategory(
  input: CreateCategoryInput
): Promise<Category> {
  const mutation = `
    mutation CreateCategory($input: CreateCategoryInput!) {
      createCategory(input: $input) {
        id
        name
        status
        parent {
          id
        }
      }
    }
  `;

  const result = await executeGraphQL<{
    createCategory: { id: number; name: string; status: string; parent: { id: number } | null };
  }>(mutation, { input });

  if (result.errors) {
    throw new Error(`Failed to create category: ${result.errors[0].message}`);
  }

  if (!result.data?.createCategory) {
    throw new Error('No category returned from mutation');
  }

  const cat = result.data.createCategory;
  return {
    id: cat.id,
    name: cat.name,
    status: cat.status,
    parentId: cat.parent?.id ?? null,
  };
}

/**
 * Allocation creation via GraphQL
 */
interface CreateAllocationInput {
  budgetId: number;
  amount: number;
  period: string;
  date?: string;
  notes?: string;
}

interface Allocation {
  id: number;
  budgetId: number;
  amount: number;
  period: string;
}

export async function createAllocation(
  input: CreateAllocationInput
): Promise<Allocation> {
  const mutation = `
    mutation CreateAllocation($input: CreateAllocationInput!) {
      createAllocation(input: $input) {
        id
        budget {
          id
        }
        amount
        period
      }
    }
  `;

  const result = await executeGraphQL<{
    createAllocation: { id: number; budget: { id: number }; amount: number; period: string };
  }>(mutation, { input });

  if (result.errors) {
    throw new Error(`Failed to create allocation: ${result.errors[0].message}`);
  }

  if (!result.data?.createAllocation) {
    throw new Error('No allocation returned from mutation');
  }

  const alloc = result.data.createAllocation;
  return {
    id: alloc.id,
    budgetId: alloc.budget.id,
    amount: alloc.amount,
    period: alloc.period,
  };
}

/**
 * Manual account creation via GraphQL
 */
interface CreateAccountInput {
  name: string;
  role: 'OPERATIONAL' | 'SAVINGS';
  type: 'DEBIT' | 'CREDIT' | 'FOP';
  currency?: string;
  balance?: number;
  iban?: string;
}

interface Account {
  id: number;
  name: string;
  role: string;
  type: string;
  currency: string;
  balance: number;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const mutation = `
    mutation CreateAccount($input: CreateAccountInput!) {
      createAccount(input: $input) {
        id
        name
        role
        type
        currency
        balance
      }
    }
  `;

  const { name, role, type, currency, balance, iban } = input;
  const result = await executeGraphQL<{ createAccount: Account }>(mutation, {
    input: {
      name,
      role,
      type,
      currency: currency ?? 'UAH',
      balance: balance ?? 0,
      ...(iban ? { iban } : {}),
    },
  });

  if (result.errors) {
    throw new Error(`Failed to create account: ${result.errors[0].message}`);
  }

  if (!result.data?.createAccount) {
    throw new Error('No account returned from mutation');
  }

  return result.data.createAccount;
}

/**
 * Transaction creation for manual accounts via GraphQL
 */
interface CreateTransactionInput {
  accountId: number;
  amount: number;
  date: string;
  description: string;
  categoryId?: number;
  budgetId?: number;
}

interface Transaction {
  id: number;
  amount: number;
  date: string;
  description: string;
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<Transaction> {
  const mutation = `
    mutation CreateTransaction($input: CreateTransactionInput!) {
      createTransaction(input: $input) {
        id
        amount
        date
        description
      }
    }
  `;

  const result = await executeGraphQL<{ createTransaction: Transaction }>(
    mutation,
    { input }
  );

  if (result.errors) {
    throw new Error(`Failed to create transaction: ${result.errors[0].message}`);
  }

  if (!result.data?.createTransaction) {
    throw new Error('No transaction returned from mutation');
  }

  return result.data.createTransaction;
}

/**
 * Query existing data
 */
export async function getAccounts(): Promise<Account[]> {
  const query = `
    query GetAccounts {
      accounts {
        id
        name
        role
        type
        currency
        balance
      }
    }
  `;

  const result = await executeGraphQL<{ accounts: Account[] }>(query);

  if (result.errors) {
    throw new Error(`Failed to get accounts: ${result.errors[0].message}`);
  }

  return result.data?.accounts ?? [];
}

export async function getBudgets(): Promise<Budget[]> {
  const query = `
    query GetBudgets {
      budgets {
        id
        name
        type
        currency
        targetAmount
      }
    }
  `;

  const result = await executeGraphQL<{ budgets: Budget[] }>(query);

  if (result.errors) {
    throw new Error(`Failed to get budgets: ${result.errors[0].message}`);
  }

  return result.data?.budgets ?? [];
}

interface MonthlyOverview {
  readyToAssign: number;
  totalAllocated: number;
  totalSpent: number;
  capitalBalance: number;
  availableFunds: number;
  savingsRate: number;
}

export async function getMonthlyOverview(month: string): Promise<MonthlyOverview> {
  const query = `
    query GetMonthlyOverview($month: String!) {
      monthlyOverview(month: $month) {
        readyToAssign
        totalAllocated
        totalSpent
        capitalBalance
        availableFunds
        savingsRate
      }
    }
  `;

  const result = await executeGraphQL<{ monthlyOverview: MonthlyOverview }>(
    query,
    { month }
  );

  if (result.errors) {
    throw new Error(`Failed to get monthly overview: ${result.errors[0].message}`);
  }

  if (!result.data?.monthlyOverview) {
    throw new Error('No monthly overview returned');
  }

  return result.data.monthlyOverview;
}
