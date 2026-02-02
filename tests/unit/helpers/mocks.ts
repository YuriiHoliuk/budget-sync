import { mock } from 'bun:test';
import type {
  CategorizeTransactionRequestDTO,
  CategorizeTransactionResultDTO,
  CategorizeTransactionUseCase,
} from '@application/use-cases/CategorizeTransaction.ts';
import type { Account } from '@domain/entities/Account.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import type { Category } from '@domain/entities/Category.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type {
  BudgetAssignmentRequest,
  BudgetAssignmentResult,
  CategoryAssignmentRequest,
  CategoryAssignmentResult,
  LLMGateway,
} from '@domain/gateways/LLMGateway.ts';
import type {
  MessageQueueGateway,
  QueueMessage,
} from '@domain/gateways/MessageQueueGateway.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import type {
  CategorizationUpdate,
  TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { Money } from '@domain/value-objects/Money.ts';
import type { Logger } from '@modules/logging';
import type { SpreadsheetsClient } from '@modules/spreadsheet/SpreadsheetsClient.ts';
import type { Row } from '@modules/spreadsheet/types.ts';

/**
 * Creates a mock BankGateway with default implementations that return empty arrays.
 * Override individual methods as needed for specific test scenarios.
 */
export function createMockBankGateway(
  overrides: Partial<{
    getAccounts: () => Promise<Account[]>;
    getTransactions: (
      accountId: string,
      from: Date,
      to: Date,
    ) => Promise<Transaction[]>;
    setWebhook: (url: string) => Promise<void>;
    parseWebhookPayload: (payload: unknown) => unknown;
  }> = {},
): BankGateway {
  return {
    getAccounts: overrides.getAccounts ?? mock(() => Promise.resolve([])),
    getTransactions:
      overrides.getTransactions ??
      mock(() => Promise.resolve([] as Transaction[])),
    setWebhook: overrides.setWebhook ?? mock(() => Promise.resolve()),
    parseWebhookPayload: overrides.parseWebhookPayload ?? mock(() => ({})),
  } as unknown as BankGateway;
}

/** Default mock implementations for AccountRepository */
function getDefaultAccountRepositoryMocks() {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByExternalId: mock(() => Promise.resolve(null)),
    findByIban: mock(() => Promise.resolve(null)),
    findByBank: mock(() => Promise.resolve([])),
    findAll: mock(() => Promise.resolve([])),
    save: mock(() => Promise.resolve()),
    saveAndReturn: mock((account: Account) => Promise.resolve(account)),
    update: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    updateLastSyncTime: mock(() => Promise.resolve()),
    updateBalance: mock(() => Promise.resolve()),
  };
}

/**
 * Creates a mock AccountRepository with default implementations.
 * All find methods return null/empty, all mutation methods resolve successfully.
 */
export function createMockAccountRepository(
  overrides: Partial<{
    findById: (id: string) => Promise<Account | null>;
    findByExternalId: (externalId: string) => Promise<Account | null>;
    findByIban: (iban: string) => Promise<Account | null>;
    findByBank: (bank: string) => Promise<Account[]>;
    findAll: () => Promise<Account[]>;
    save: (account: Account) => Promise<void>;
    saveAndReturn: (account: Account) => Promise<Account>;
    update: (account: Account) => Promise<void>;
    delete: (id: string) => Promise<void>;
    updateLastSyncTime: (accountId: string, timestamp: number) => Promise<void>;
    updateBalance: (externalId: string, newBalance: Money) => Promise<void>;
  }> = {},
): AccountRepository {
  const defaults = getDefaultAccountRepositoryMocks();
  return { ...defaults, ...overrides } as unknown as AccountRepository;
}

/** Default mock implementations for TransactionRepository */
function getDefaultTransactionRepositoryMocks() {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByExternalId: mock(() => Promise.resolve(null)),
    findByExternalIds: mock(() =>
      Promise.resolve(new Map<string, Transaction>()),
    ),
    findByAccountId: mock(() => Promise.resolve([])),
    findAll: mock(() => Promise.resolve([])),
    save: mock(() => Promise.resolve()),
    saveAndReturn: mock((transaction: Transaction) =>
      Promise.resolve(transaction),
    ),
    update: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    saveMany: mock(() => Promise.resolve()),
    saveManyAndReturn: mock((transactions: Transaction[]) =>
      Promise.resolve(transactions),
    ),
    updateMany: mock(() => Promise.resolve()),
    updateCategorization: mock(() => Promise.resolve()),
    findByCategorizationStatus: mock(() => Promise.resolve([])),
    findUncategorized: mock(() => Promise.resolve([])),
  };
}

/**
 * Creates a mock TransactionRepository with default implementations.
 * All find methods return null/empty, all mutation methods resolve successfully.
 */
export function createMockTransactionRepository(
  overrides: Partial<{
    findById: (id: string) => Promise<Transaction | null>;
    findByExternalId: (externalId: string) => Promise<Transaction | null>;
    findByExternalIds: (
      externalIds: string[],
    ) => Promise<Map<string, Transaction>>;
    findByAccountId: (accountId: string) => Promise<Transaction[]>;
    findAll: () => Promise<Transaction[]>;
    save: (transaction: Transaction) => Promise<void>;
    saveAndReturn: (transaction: Transaction) => Promise<Transaction>;
    update: (transaction: Transaction) => Promise<void>;
    delete: (id: string) => Promise<void>;
    saveMany: (transactions: Transaction[]) => Promise<void>;
    saveManyAndReturn: (transactions: Transaction[]) => Promise<Transaction[]>;
    updateMany: (transactions: Transaction[]) => Promise<void>;
    updateCategorization: (
      externalId: string,
      data: CategorizationUpdate,
    ) => Promise<void>;
    findByCategorizationStatus: (status: string) => Promise<Transaction[]>;
    findUncategorized: () => Promise<Transaction[]>;
  }> = {},
): TransactionRepository {
  const defaults = getDefaultTransactionRepositoryMocks();
  return { ...defaults, ...overrides } as unknown as TransactionRepository;
}

/**
 * Creates a mock Logger with all methods as no-op mocks.
 */
export function createMockLogger(): Logger {
  return {
    info: mock(() => undefined),
    debug: mock(() => undefined),
    warn: mock(() => undefined),
    error: mock(() => undefined),
  } as unknown as Logger;
}

/**
 * Creates a mock MessageQueueGateway with default implementations.
 * Publish returns a message ID, pull returns empty array, acknowledge resolves.
 */
export function createMockMessageQueueGateway(
  overrides: Partial<{
    publish: (data: unknown) => Promise<string>;
    pull: (maxMessages?: number) => Promise<QueueMessage[]>;
    acknowledge: (ackId: string) => Promise<void>;
  }> = {},
): MessageQueueGateway {
  return {
    publish: overrides.publish ?? mock(() => Promise.resolve('msg-123')),
    pull: overrides.pull ?? mock(() => Promise.resolve([])),
    acknowledge: overrides.acknowledge ?? mock(() => Promise.resolve()),
  } as unknown as MessageQueueGateway;
}

/**
 * Creates a mock CategorizeTransactionUseCase with default implementation.
 * Execute returns a successful categorization result.
 */
export function createMockCategorizeTransactionUseCase(
  overrides: Partial<{
    execute: (
      request: CategorizeTransactionRequestDTO,
    ) => Promise<CategorizeTransactionResultDTO>;
  }> = {},
): CategorizeTransactionUseCase {
  return {
    execute:
      overrides.execute ??
      mock(() =>
        Promise.resolve({
          success: true,
          category: 'Test Category',
          budget: null,
          isNewCategory: false,
        }),
      ),
  } as unknown as CategorizeTransactionUseCase;
}

/**
 * Creates a mock CategoryRepository with default implementations.
 * All find methods return null/empty, mutation methods resolve successfully.
 */
export function createMockCategoryRepository(
  overrides: Partial<{
    findAll: () => Promise<Category[]>;
    findById: (id: number) => Promise<Category | null>;
    findByName: (name: string) => Promise<Category | null>;
    findActive: () => Promise<Category[]>;
    save: (category: Category) => Promise<void>;
    saveAndReturn: (category: Category) => Promise<Category>;
    update: (category: Category) => Promise<Category>;
  }> = {},
): CategoryRepository {
  return {
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
    findById: overrides.findById ?? mock(() => Promise.resolve(null)),
    findByName: overrides.findByName ?? mock(() => Promise.resolve(null)),
    findActive: overrides.findActive ?? mock(() => Promise.resolve([])),
    save: overrides.save ?? mock(() => Promise.resolve()),
    saveAndReturn:
      overrides.saveAndReturn ??
      mock((category: Category) => Promise.resolve(category)),
    update:
      overrides.update ??
      mock((category: Category) => Promise.resolve(category)),
  } as unknown as CategoryRepository;
}

/**
 * Creates a mock BudgetRepository with default implementations.
 * All find methods return null/empty arrays.
 */
export function createMockBudgetRepository(
  overrides: Partial<{
    findAll: () => Promise<Budget[]>;
    findById: (id: number) => Promise<Budget | null>;
    findByName: (name: string) => Promise<Budget | null>;
    findActive: (date: Date) => Promise<Budget[]>;
    save: (budget: Budget) => Promise<void>;
    saveAndReturn: (budget: Budget) => Promise<Budget>;
    update: (budget: Budget) => Promise<Budget>;
  }> = {},
): BudgetRepository {
  return {
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
    findById: overrides.findById ?? mock(() => Promise.resolve(null)),
    findByName: overrides.findByName ?? mock(() => Promise.resolve(null)),
    findActive: overrides.findActive ?? mock(() => Promise.resolve([])),
    save: overrides.save ?? mock(() => Promise.resolve()),
    saveAndReturn:
      overrides.saveAndReturn ??
      mock((budget: Budget) => Promise.resolve(budget)),
    update:
      overrides.update ?? mock((budget: Budget) => Promise.resolve(budget)),
  } as unknown as BudgetRepository;
}

/**
 * Creates a mock LLMGateway with default implementations.
 * Returns empty assignment results by default.
 */
export function createMockLLMGateway(
  overrides: Partial<{
    assignCategory: (
      request: CategoryAssignmentRequest,
    ) => Promise<CategoryAssignmentResult>;
    assignBudget: (
      request: BudgetAssignmentRequest,
    ) => Promise<BudgetAssignmentResult>;
  }> = {},
): LLMGateway {
  const defaultCategoryResult: CategoryAssignmentResult = {
    category: null,
    categoryReason: null,
    isNewCategory: false,
  };
  const defaultBudgetResult: BudgetAssignmentResult = {
    budget: null,
    budgetReason: null,
  };
  return {
    assignCategory:
      overrides.assignCategory ??
      mock(() => Promise.resolve(defaultCategoryResult)),
    assignBudget:
      overrides.assignBudget ??
      mock(() => Promise.resolve(defaultBudgetResult)),
  } as unknown as LLMGateway;
}

/**
 * Creates a mock CategorizationRuleRepository with default implementations.
 * Returns an empty array of rules by default.
 */
export function createMockCategorizationRuleRepository(
  overrides: Partial<{
    findAll: () => Promise<string[]>;
  }> = {},
): CategorizationRuleRepository {
  return {
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
  } as unknown as CategorizationRuleRepository;
}

/**
 * Creates a mock BudgetizationRuleRepository with default implementations.
 * Returns an empty array of rules by default.
 */
export function createMockBudgetizationRuleRepository(
  overrides: Partial<{
    findAll: () => Promise<string[]>;
  }> = {},
): BudgetizationRuleRepository {
  return {
    findAll: overrides.findAll ?? mock(() => Promise.resolve([])),
  } as unknown as BudgetizationRuleRepository;
}

/**
 * Creates a mock SpreadsheetsClient for testing.
 *
 * The mock simulates the behavior of the real SpreadsheetsClient
 * by providing methods that return test data. For table-based operations,
 * pass the rows array which will be returned by readHeaders and readAllRows.
 *
 * @param rows - Array of rows where first row is headers, rest is data
 */
export function createMockSpreadsheetsClient(
  rows: Row[] = [],
): SpreadsheetsClient {
  return {
    readHeaders: mock(() => Promise.resolve(rows[0]?.map(String) ?? [])),
    readAllRows: mock(() => Promise.resolve(rows)),
    readRange: mock(() => Promise.resolve(rows)),
    getMetadata: mock(() =>
      Promise.resolve({
        spreadsheetId: 'test-id',
        title: 'Test Spreadsheet',
        sheets: [],
      }),
    ),
    getSheetInfo: mock(() =>
      Promise.resolve({
        id: 0,
        title: 'Test Sheet',
        rowCount: rows.length,
        columnCount: rows[0]?.length ?? 0,
      }),
    ),
    readRow: mock(() => Promise.resolve(null)),
    writeRange: mock(() =>
      Promise.resolve({
        updatedRange: '',
        updatedRows: 0,
        updatedColumns: 0,
        updatedCells: 0,
      }),
    ),
    appendRows: mock(() =>
      Promise.resolve({ updatedRange: '', updatedRows: 0, updatedCells: 0 }),
    ),
    appendRowsCells: mock(() =>
      Promise.resolve({ updatedRange: '', updatedRows: 0, updatedCells: 0 }),
    ),
    updateCellsAt: mock(() =>
      Promise.resolve({
        updatedRange: '',
        updatedRows: 0,
        updatedColumns: 0,
        updatedCells: 0,
      }),
    ),
  } as unknown as SpreadsheetsClient;
}
