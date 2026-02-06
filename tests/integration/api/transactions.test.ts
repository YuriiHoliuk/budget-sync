/**
 * API Integration Tests for Transactions
 *
 * Tests the GraphQL transactions queries and mutations against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/transactions.test.ts
 */

import 'reflect-metadata';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  clearAllTestData,
  createTestAccount,
  createTestBudget,
  createTestCategory,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Transactions API Integration', () => {
  beforeAll(async () => {
    await harness.setup();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  afterEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  describe('Query: transactions', () => {
    test('should return empty connection when no transactions exist', async () => {
      const result = await harness.executeQuery<{
        transactions: {
          items: unknown[];
          totalCount: number;
          hasMore: boolean;
        };
      }>(`
        query {
          transactions {
            items {
              id
            }
            totalCount
            hasMore
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toEqual([]);
      expect(result.data?.transactions.totalCount).toBe(0);
      expect(result.data?.transactions.hasMore).toBe(false);
    });

    test('should return all transactions with pagination info', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        amount: -15000,
        counterparty: 'Silpo',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        amount: -25000,
        counterparty: 'ATB',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ id: number; amount: number }>;
          totalCount: number;
          hasMore: boolean;
        };
      }>(`
        query {
          transactions {
            items {
              id
              amount
            }
            totalCount
            hasMore
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(2);
      expect(result.data?.transactions.totalCount).toBe(2);
      expect(result.data?.transactions.hasMore).toBe(false);
    });

    test('should return transaction with all fields', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Main Account',
        currency: 'UAH',
      });
      const category = await createTestCategory(harness.getDb(), {
        name: 'Groceries',
      });
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Groceries Budget',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        amount: -35000, // 350 UAH expense
        type: 'debit',
        currency: 'UAH',
        counterparty: 'Silpo',
        bankDescription: 'Payment at Silpo store',
        mcc: 5411,
        categoryId: category.id,
        budgetId: budget.id,
        categorizationStatus: 'verified',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{
            id: number;
            externalId: string;
            date: string;
            amount: number;
            currency: string;
            type: string;
            description: string;
            categorizationStatus: string;
            mcc: number | null;
            counterpartyName: string | null;
            account: { id: number; name: string };
            category: { id: number; name: string } | null;
            budget: { id: number; name: string } | null;
          }>;
        };
      }>(`
        query {
          transactions {
            items {
              id
              externalId
              date
              amount
              currency
              type
              description
              categorizationStatus
              mcc
              counterpartyName
              account {
                id
                name
              }
              category {
                id
                name
              }
              budget {
                id
                name
              }
            }
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      const tx = result.data?.transactions.items[0];
      expect(tx?.amount).toBe(350); // major units, always positive
      expect(tx?.type).toBe('DEBIT');
      expect(tx?.currency).toBe('UAH');
      expect(tx?.categorizationStatus).toBe('VERIFIED');
      expect(tx?.mcc).toBe(5411);
      expect(tx?.counterpartyName).toBe('Silpo');
      expect(tx?.account.name).toBe('Main Account');
      expect(tx?.category?.name).toBe('Groceries');
      expect(tx?.budget?.name).toBe('Groceries Budget');
    });

    test('should filter by account', async () => {
      const account1 = await createTestAccount(harness.getDb(), {
        name: 'Account 1',
      });
      const account2 = await createTestAccount(harness.getDb(), {
        name: 'Account 2',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account1.id,
        accountExternalId: account1.externalId,
        counterparty: 'Account 1 TX',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account2.id,
        accountExternalId: account2.externalId,
        counterparty: 'Account 2 TX',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ id: number; counterpartyName: string }>;
          totalCount: number;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              id
              counterpartyName
            }
            totalCount
          }
        }
      `,
        { filter: { accountId: account1.id } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Account 1 TX',
      );
    });

    test('should filter by category', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const category1 = await createTestCategory(harness.getDb(), {
        name: 'Groceries',
      });
      const category2 = await createTestCategory(harness.getDb(), {
        name: 'Transport',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categoryId: category1.id,
        counterparty: 'Silpo',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categoryId: category2.id,
        counterparty: 'Bolt',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { categoryId: category1.id } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Silpo',
      );
    });

    test('should filter by budget', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const budget1 = await createTestBudget(harness.getDb(), {
        name: 'Groceries Budget',
      });
      const budget2 = await createTestBudget(harness.getDb(), {
        name: 'Transport Budget',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        budgetId: budget1.id,
        counterparty: 'With Budget 1',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        budgetId: budget2.id,
        counterparty: 'With Budget 2',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { budgetId: budget1.id } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'With Budget 1',
      );
    });

    test('should filter by type', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        amount: -15000, // expense
        type: 'debit',
        counterparty: 'Expense',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        amount: 75000, // income
        type: 'credit',
        counterparty: 'Income',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string; type: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
              type
            }
          }
        }
      `,
        { filter: { type: 'CREDIT' } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Income',
      );
    });

    test('should filter by date range', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        date: new Date('2026-02-01'),
        counterparty: 'Feb Transaction',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        date: new Date('2026-01-15'),
        counterparty: 'Jan Transaction',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { dateFrom: '2026-02-01', dateTo: '2026-02-28' } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Feb Transaction',
      );
    });

    test('should filter by categorization status', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categorizationStatus: 'pending',
        counterparty: 'Pending',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categorizationStatus: 'verified',
        counterparty: 'Verified',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { categorizationStatus: 'PENDING' } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Pending',
      );
    });

    test('should filter by search text', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });

      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        counterparty: 'Silpo Store',
        bankDescription: 'Payment at Silpo',
      });
      await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        counterparty: 'ATB Market',
        bankDescription: 'Payment at ATB',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { search: 'Silpo' } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Silpo Store',
      );
    });

    test('should support pagination with limit and offset', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });

      // Create 5 transactions
      for (let index = 0; index < 5; index++) {
        await createTestTransaction(harness.getDb(), {
          accountId: account.id,
          accountExternalId: account.externalId,
          counterparty: `TX ${index}`,
          date: new Date(`2026-02-0${index + 1}`),
        });
      }

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
          totalCount: number;
          hasMore: boolean;
        };
      }>(
        `
        query GetTransactions($pagination: PaginationInput) {
          transactions(pagination: $pagination) {
            items {
              counterpartyName
            }
            totalCount
            hasMore
          }
        }
      `,
        { pagination: { limit: 2, offset: 0 } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(2);
      expect(result.data?.transactions.totalCount).toBe(5);
      expect(result.data?.transactions.hasMore).toBe(true);
    });

    test('should filter unbudgeted transactions', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Operational',
        role: 'operational',
      });
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Budget',
      });

      // Unbudgeted expense
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -15000,
        type: 'debit',
        budgetId: null,
        counterparty: 'Unbudgeted TX',
      });

      // Budgeted expense (should not appear)
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -20000,
        type: 'debit',
        budgetId: budget.id,
        counterparty: 'Budgeted TX',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { unbudgetedOnly: true } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Unbudgeted TX',
      );
    });

    test('should filter unbudgeted transactions from operational accounts using combined filters', async () => {
      const operationalAccount = await createTestAccount(harness.getDb(), {
        name: 'Operational',
        role: 'operational',
      });
      const savingsAccount = await createTestAccount(harness.getDb(), {
        name: 'Savings',
        role: 'savings',
      });
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Budget',
      });

      // Unbudgeted expense from operational account
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -15000,
        type: 'debit',
        budgetId: null,
        counterparty: 'Unbudgeted Operational',
      });

      // Budgeted expense from operational account
      await createTestTransaction(harness.getDb(), {
        accountId: operationalAccount.id,
        accountExternalId: operationalAccount.externalId,
        amount: -20000,
        type: 'debit',
        budgetId: budget.id,
        counterparty: 'Budgeted Operational',
      });

      // Unbudgeted expense from savings account (should not appear due to accountRole filter)
      await createTestTransaction(harness.getDb(), {
        accountId: savingsAccount.id,
        accountExternalId: savingsAccount.externalId,
        amount: -10000,
        type: 'debit',
        budgetId: null,
        counterparty: 'Savings Expense',
      });

      const result = await harness.executeQuery<{
        transactions: {
          items: Array<{ counterpartyName: string }>;
        };
      }>(
        `
        query GetTransactions($filter: TransactionFilter) {
          transactions(filter: $filter) {
            items {
              counterpartyName
            }
          }
        }
      `,
        { filter: { unbudgetedOnly: true, accountRole: 'OPERATIONAL' } },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transactions.items).toHaveLength(1);
      expect(result.data?.transactions.items[0]?.counterpartyName).toBe(
        'Unbudgeted Operational',
      );
    });
  });

  describe('Query: transaction', () => {
    test('should return single transaction by id', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const transaction = await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        counterparty: 'Test Transaction',
      });

      const result = await harness.executeQuery<{
        transaction: { id: number; counterpartyName: string } | null;
      }>(
        `
        query GetTransaction($id: Int!) {
          transaction(id: $id) {
            id
            counterpartyName
          }
        }
      `,
        { id: transaction.id },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transaction?.counterpartyName).toBe(
        'Test Transaction',
      );
    });

    test('should return null for non-existent transaction', async () => {
      const result = await harness.executeQuery<{
        transaction: { id: number } | null;
      }>(
        `
        query GetTransaction($id: Int!) {
          transaction(id: $id) {
            id
          }
        }
      `,
        { id: 99999 },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.transaction).toBeNull();
    });
  });

  describe('Mutation: createTransaction', () => {
    test('should create transaction on manual account', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Cash',
        source: 'manual',
      });

      const result = await harness.executeQuery<{
        createTransaction: {
          id: number;
          amount: number;
          type: string;
          description: string;
          account: { id: number; name: string };
        };
      }>(
        `
        mutation CreateTransaction($input: CreateTransactionInput!) {
          createTransaction(input: $input) {
            id
            amount
            type
            description
            account {
              id
              name
            }
          }
        }
      `,
        {
          input: {
            accountId: account.id,
            date: '2026-02-01',
            amount: 150,
            type: 'DEBIT',
            description: 'Coffee purchase',
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createTransaction.amount).toBe(150);
      expect(result.data?.createTransaction.type).toBe('DEBIT');
      expect(result.data?.createTransaction.description).toBe(
        'Coffee purchase',
      );
      expect(result.data?.createTransaction.account.name).toBe('Cash');
    });

    test('should reject transaction on synced account', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Bank Account',
        source: 'bank_sync',
      });

      const result = await harness.executeQuery<{
        createTransaction: { id: number };
      }>(
        `
        mutation CreateTransaction($input: CreateTransactionInput!) {
          createTransaction(input: $input) {
            id
          }
        }
      `,
        {
          input: {
            accountId: account.id,
            date: '2026-02-01',
            amount: 150,
            type: 'DEBIT',
            description: 'Should fail',
          },
        },
      );

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('manual');
    });
  });

  describe('Mutation: updateTransactionCategory', () => {
    test('should update transaction category', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const category = await createTestCategory(harness.getDb(), {
        name: 'Groceries',
      });
      const transaction = await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categoryId: null,
      });

      const result = await harness.executeQuery<{
        updateTransactionCategory: {
          id: number;
          category: { id: number; name: string } | null;
          categorizationStatus: string;
        };
      }>(
        `
        mutation UpdateTransactionCategory($input: UpdateTransactionCategoryInput!) {
          updateTransactionCategory(input: $input) {
            id
            category {
              id
              name
            }
            categorizationStatus
          }
        }
      `,
        {
          input: {
            id: transaction.id,
            categoryId: category.id,
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.updateTransactionCategory.category?.name).toBe(
        'Groceries',
      );
      // Should auto-verify when user sets category
      expect(result.data?.updateTransactionCategory.categorizationStatus).toBe(
        'VERIFIED',
      );
    });

    test('should clear transaction category', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const category = await createTestCategory(harness.getDb(), {
        name: 'Groceries',
      });
      const transaction = await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categoryId: category.id,
      });

      const result = await harness.executeQuery<{
        updateTransactionCategory: {
          id: number;
          category: { id: number } | null;
        };
      }>(
        `
        mutation UpdateTransactionCategory($input: UpdateTransactionCategoryInput!) {
          updateTransactionCategory(input: $input) {
            id
            category {
              id
            }
          }
        }
      `,
        {
          input: {
            id: transaction.id,
            categoryId: null,
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.updateTransactionCategory.category).toBeNull();
    });
  });

  describe('Mutation: updateTransactionBudget', () => {
    test('should update transaction budget', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const budget = await createTestBudget(harness.getDb(), {
        name: 'Groceries Budget',
      });
      const transaction = await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        budgetId: null,
      });

      const result = await harness.executeQuery<{
        updateTransactionBudget: {
          id: number;
          budget: { id: number; name: string } | null;
          categorizationStatus: string;
        };
      }>(
        `
        mutation UpdateTransactionBudget($input: UpdateTransactionBudgetInput!) {
          updateTransactionBudget(input: $input) {
            id
            budget {
              id
              name
            }
            categorizationStatus
          }
        }
      `,
        {
          input: {
            id: transaction.id,
            budgetId: budget.id,
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.updateTransactionBudget.budget?.name).toBe(
        'Groceries Budget',
      );
      // Should auto-verify when user sets budget
      expect(result.data?.updateTransactionBudget.categorizationStatus).toBe(
        'VERIFIED',
      );
    });
  });

  describe('Mutation: verifyTransaction', () => {
    test('should mark transaction as verified', async () => {
      const account = await createTestAccount(harness.getDb(), {
        name: 'Account',
      });
      const transaction = await createTestTransaction(harness.getDb(), {
        accountId: account.id,
        accountExternalId: account.externalId,
        categorizationStatus: 'pending',
      });

      const result = await harness.executeQuery<{
        verifyTransaction: {
          id: number;
          categorizationStatus: string;
        };
      }>(
        `
        mutation VerifyTransaction($id: Int!) {
          verifyTransaction(id: $id) {
            id
            categorizationStatus
          }
        }
      `,
        { id: transaction.id },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.verifyTransaction.categorizationStatus).toBe(
        'VERIFIED',
      );
    });
  });
});
