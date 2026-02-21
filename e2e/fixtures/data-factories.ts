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
  currency?: string;
  targetAmount?: number;
  cadenceUnit?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  cadenceCount?: number;
  targetDate?: string;
  startDate?: string;
  endDate?: string;
  cap?: number;
  budgetGroupId?: number;
}

interface Budget {
  id: number;
  name: string;
  currency: string;
  targetAmount: number | null;
  cap: number | null;
  budgetGroupId?: number | null;
}

export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  const mutation = `
    mutation CreateBudget($input: CreateBudgetInput!) {
      createBudget(input: $input) {
        id
        name
        currency
        targetAmount
        cap
        budgetGroupId
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
  currency?: string;
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
  }>(mutation, { input: { currency: 'UAH', ...input } });

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
  type: 'CREDIT' | 'DEBIT';
  date: string;
  description: string;
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
 * Assign a budget to a transaction via GraphQL
 */
export async function updateTransactionBudget(
  transactionId: number,
  budgetId: number,
): Promise<Transaction> {
  const mutation = `
    mutation UpdateTransactionBudget($input: UpdateTransactionBudgetInput!) {
      updateTransactionBudget(input: $input) {
        id
        amount
        date
        description
      }
    }
  `;

  const result = await executeGraphQL<{
    updateTransactionBudget: Transaction;
  }>(mutation, {
    input: { id: transactionId, budgetId },
  });

  if (result.errors) {
    throw new Error(
      `Failed to update transaction budget: ${result.errors[0].message}`,
    );
  }

  if (!result.data?.updateTransactionBudget) {
    throw new Error('No transaction returned from update budget mutation');
  }

  return result.data.updateTransactionBudget;
}

/**
 * Update a budget via GraphQL
 */
interface UpdateBudgetInput {
  id: number;
  month: string;
  name?: string;
  targetAmount?: number;
  endDate?: string | null;
  cap?: number | null;
  budgetGroupId?: number | null;
}

interface UpdatedBudget {
  id: number;
  name: string;
  currency: string;
  targetAmount: number;
  cadenceUnit: string | null;
  cadenceCount: number | null;
  targetDate: string | null;
  startDate: string | null;
  endDate: string | null;
  cap: number | null;
  budgetGroupId: number | null;
}

export async function updateBudget(input: UpdateBudgetInput): Promise<UpdatedBudget> {
  const mutation = `
    mutation UpdateBudget($input: UpdateBudgetInput!) {
      updateBudget(input: $input) {
        id
        name
        currency
        targetAmount
        cadenceUnit
        cadenceCount
        targetDate
        startDate
        endDate
        cap
        budgetGroupId
      }
    }
  `;

  const result = await executeGraphQL<{ updateBudget: UpdatedBudget }>(mutation, {
    input,
  });

  if (result.errors) {
    throw new Error(`Failed to update budget: ${result.errors[0].message}`);
  }

  if (!result.data?.updateBudget) {
    throw new Error('No budget returned from update mutation');
  }

  return result.data.updateBudget;
}

/**
 * Archive a budget via GraphQL
 */
export async function archiveBudget(budgetId: number): Promise<Budget> {
  const mutation = `
    mutation ArchiveBudget($id: Int!) {
      archiveBudget(id: $id) {
        id
        name
        currency
        targetAmount
        cap
      }
    }
  `;

  const result = await executeGraphQL<{ archiveBudget: Budget }>(mutation, {
    id: budgetId,
  });

  if (result.errors) {
    throw new Error(`Failed to archive budget: ${result.errors[0].message}`);
  }

  if (!result.data?.archiveBudget) {
    throw new Error('No budget returned from archive mutation');
  }

  return result.data.archiveBudget;
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
        currency
        targetAmount
        cap
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

interface BudgetSummary {
  budgetId: number;
  name: string;
  targetAmount: number;
  allocated: number;
  spent: number;
  available: number;
  suggestedAllocation: number;
  isExpired: boolean;
}

interface MonthlyOverviewWithBudgets extends MonthlyOverview {
  budgetSummaries: BudgetSummary[];
}

export async function getMonthlyOverviewWithBudgets(
  month: string
): Promise<MonthlyOverviewWithBudgets> {
  const query = `
    query GetMonthlyOverview($month: String!) {
      monthlyOverview(month: $month) {
        readyToAssign
        totalAllocated
        totalSpent
        capitalBalance
        availableFunds
        savingsRate
        budgetSummaries {
          budgetId
          name
          targetAmount
          allocated
          spent
          available
          suggestedAllocation
          isExpired
        }
      }
    }
  `;

  const result = await executeGraphQL<{
    monthlyOverview: MonthlyOverviewWithBudgets;
  }>(query, { month });

  if (result.errors) {
    throw new Error(
      `Failed to get monthly overview: ${result.errors[0].message}`
    );
  }

  if (!result.data?.monthlyOverview) {
    throw new Error('No monthly overview returned');
  }

  return result.data.monthlyOverview;
}

/**
 * Budget group operations via GraphQL
 */
interface BudgetGroup {
  id: number;
  name: string;
  sortOrder: string | null;
}

export async function createBudgetGroup(name: string): Promise<BudgetGroup> {
  const mutation = `
    mutation CreateBudgetGroup($name: String!) {
      createBudgetGroup(name: $name) {
        id
        name
        sortOrder
      }
    }
  `;

  const result = await executeGraphQL<{ createBudgetGroup: BudgetGroup }>(
    mutation,
    { name }
  );

  if (result.errors) {
    throw new Error(`Failed to create budget group: ${result.errors[0].message}`);
  }

  if (!result.data?.createBudgetGroup) {
    throw new Error('No budget group returned from mutation');
  }

  return result.data.createBudgetGroup;
}

export async function updateBudgetGroup(
  id: number,
  name: string
): Promise<BudgetGroup> {
  const mutation = `
    mutation UpdateBudgetGroup($id: Int!, $name: String!) {
      updateBudgetGroup(id: $id, name: $name) {
        id
        name
        sortOrder
      }
    }
  `;

  const result = await executeGraphQL<{ updateBudgetGroup: BudgetGroup }>(
    mutation,
    { id, name }
  );

  if (result.errors) {
    throw new Error(`Failed to update budget group: ${result.errors[0].message}`);
  }

  if (!result.data?.updateBudgetGroup) {
    throw new Error('No budget group returned from mutation');
  }

  return result.data.updateBudgetGroup;
}

export async function deleteBudgetGroup(id: number): Promise<boolean> {
  const mutation = `
    mutation DeleteBudgetGroup($id: Int!) {
      deleteBudgetGroup(id: $id)
    }
  `;

  const result = await executeGraphQL<{ deleteBudgetGroup: boolean }>(
    mutation,
    { id }
  );

  if (result.errors) {
    throw new Error(`Failed to delete budget group: ${result.errors[0].message}`);
  }

  return result.data?.deleteBudgetGroup ?? false;
}

export async function getBudgetGroups(): Promise<BudgetGroup[]> {
  const query = `
    query GetBudgetGroups {
      budgetGroups {
        id
        name
        sortOrder
      }
    }
  `;

  const result = await executeGraphQL<{ budgetGroups: BudgetGroup[] }>(query);

  if (result.errors) {
    throw new Error(`Failed to get budget groups: ${result.errors[0].message}`);
  }

  return result.data?.budgetGroups ?? [];
}

/**
 * Budget reordering via GraphQL
 */
interface ReorderBudgetInput {
  budgetId: number;
  afterBudgetId?: number | null;
  beforeBudgetId?: number | null;
  budgetGroupId?: number | null;
}

interface ReorderedBudget {
  id: number;
  name: string;
  sortOrder: string | null;
  budgetGroupId: number | null;
}

export async function reorderBudget(
  input: ReorderBudgetInput
): Promise<ReorderedBudget> {
  const mutation = `
    mutation ReorderBudget($input: ReorderBudgetInput!) {
      reorderBudget(input: $input) {
        id
        name
        sortOrder
        budgetGroupId
      }
    }
  `;

  const result = await executeGraphQL<{ reorderBudget: ReorderedBudget }>(
    mutation,
    { input }
  );

  if (result.errors) {
    throw new Error(`Failed to reorder budget: ${result.errors[0].message}`);
  }

  if (!result.data?.reorderBudget) {
    throw new Error('No budget returned from reorder mutation');
  }

  return result.data.reorderBudget;
}

/**
 * Get budgets with sort order
 */
interface BudgetWithOrder {
  id: number;
  name: string;
  sortOrder: string | null;
  budgetGroupId: number | null;
}

/**
 * Categorization rule creation via GraphQL
 */
interface CreateRuleInput {
  rule: string;
  priority?: number;
}

interface Rule {
  id: number;
  rule: string;
  priority: number;
}

export async function createCategorizationRule(input: CreateRuleInput): Promise<Rule> {
  const mutation = `
    mutation CreateCategorizationRule($input: CreateRuleInput!) {
      createCategorizationRule(input: $input) {
        id
        rule
        priority
      }
    }
  `;

  const result = await executeGraphQL<{ createCategorizationRule: Rule }>(mutation, { input });

  if (result.errors) {
    throw new Error(`Failed to create categorization rule: ${result.errors[0].message}`);
  }

  if (!result.data?.createCategorizationRule) {
    throw new Error('No rule returned from mutation');
  }

  return result.data.createCategorizationRule;
}

export async function createBudgetizationRule(input: CreateRuleInput): Promise<Rule> {
  const mutation = `
    mutation CreateBudgetizationRule($input: CreateRuleInput!) {
      createBudgetizationRule(input: $input) {
        id
        rule
        priority
      }
    }
  `;

  const result = await executeGraphQL<{ createBudgetizationRule: Rule }>(mutation, { input });

  if (result.errors) {
    throw new Error(`Failed to create budgetization rule: ${result.errors[0].message}`);
  }

  if (!result.data?.createBudgetizationRule) {
    throw new Error('No rule returned from mutation');
  }

  return result.data.createBudgetizationRule;
}

export async function getBudgetsWithOrder(): Promise<BudgetWithOrder[]> {
  const query = `
    query GetBudgets {
      budgets {
        id
        name
        sortOrder
        budgetGroupId
      }
    }
  `;

  const result = await executeGraphQL<{ budgets: BudgetWithOrder[] }>(query);

  if (result.errors) {
    throw new Error(`Failed to get budgets: ${result.errors[0].message}`);
  }

  return result.data?.budgets ?? [];
}
