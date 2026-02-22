/**
 * API Integration Tests for Split Transaction Mutation
 *
 * Tests the GraphQL splitTransaction mutation.
 * Covers: happy path (split into 2 parts), siblingTransactions field,
 * and validation errors (amounts exceed original).
 *
 * Run with: bun test tests/integration/api/split-transaction.test.ts
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
  createTestBankTransaction,
  createTestBudget,
  createTestCategory,
  createTestTransaction,
  createTestTransactionSource,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const SPLIT_TRANSACTION = `
  mutation SplitTransaction($input: SplitTransactionInput!) {
    splitTransaction(input: $input) {
      sourceTransaction {
        id
        amount
        type
        description
        siblingTransactions {
          id
          amount
          description
          category { id name }
          budget { id name }
        }
      }
      splitTransactions {
        id
        amount
        type
        description
        category { id name }
        budget { id name }
        notes
        siblingTransactions {
          id
          amount
          description
        }
      }
    }
  }
`;

const GET_TRANSACTION = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      amount
      type
      description
      siblingTransactions {
        id
        amount
        description
        category { id name }
        budget { id name }
      }
    }
  }
`;

interface SplitTransactionResult {
  splitTransaction: {
    sourceTransaction: {
      id: number;
      amount: number;
      type: string;
      description: string;
      siblingTransactions: SiblingGql[];
    };
    splitTransactions: Array<{
      id: number;
      amount: number;
      type: string;
      description: string;
      category: { id: number; name: string } | null;
      budget: { id: number; name: string } | null;
      notes: string | null;
      siblingTransactions: SiblingGql[];
    }>;
  };
}

interface SiblingGql {
  id: number;
  amount: number;
  description: string;
  category?: { id: number; name: string } | null;
  budget?: { id: number; name: string } | null;
}

interface GetTransactionResult {
  transaction: {
    id: number;
    amount: number;
    type: string;
    description: string;
    siblingTransactions: SiblingGql[];
  } | null;
}

describe('Mutation: splitTransaction', () => {
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

  test('should split a debit transaction into 2 parts', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const category = await createTestCategory(harness.getDb(), {
      name: 'Groceries',
    });
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries Budget',
    });

    // Create transaction with 100.00 UAH (10000 minor units, positive)
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000, // 100.00 UAH in minor units (positive for split use case)
      bankDescription: 'Original Purchase',
    });

    // Create and link a bank transaction
    const bankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTx.id,
    });

    const result = await harness.executeQuery<SplitTransactionResult>(
      SPLIT_TRANSACTION,
      {
        input: {
          transactionId: transaction.id,
          parts: [
            {
              amount: 30,
              description: 'Groceries',
              categoryId: category.id,
              budgetId: budget.id,
              notes: 'Weekly groceries',
            },
            {
              amount: 40,
              description: 'Household items',
            },
          ],
        },
      },
    );

    expect(result.errors).toBeUndefined();
    const data = result.data?.splitTransaction;

    // Source transaction amount should be the remainder: 100 - 30 - 40 = 30
    expect(data?.sourceTransaction.amount).toBe(30);
    expect(data?.sourceTransaction.type).toBe('DEBIT');

    // Two new split transactions
    expect(data?.splitTransactions).toHaveLength(2);

    const splitPart1 = data?.splitTransactions[0];
    expect(splitPart1?.amount).toBe(30);
    expect(splitPart1?.type).toBe('DEBIT');
    expect(splitPart1?.description).toBe('Groceries');
    expect(splitPart1?.category?.id).toBe(category.id);
    expect(splitPart1?.category?.name).toBe('Groceries');
    expect(splitPart1?.budget?.id).toBe(budget.id);
    expect(splitPart1?.budget?.name).toBe('Groceries Budget');
    expect(splitPart1?.notes).toBe('Weekly groceries');

    const splitPart2 = data?.splitTransactions[1];
    expect(splitPart2?.amount).toBe(40);
    expect(splitPart2?.type).toBe('DEBIT');
    expect(splitPart2?.description).toBe('Household items');
    expect(splitPart2?.category).toBeNull();
    expect(splitPart2?.budget).toBeNull();
  });

  test('should populate siblingTransactions on source and splits', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create transaction: 100.00 UAH
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original Purchase',
    });

    // Link a bank transaction so siblings can be discovered
    const bankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTx.id,
    });

    // Split: 30 + 40, remainder = 30
    const splitResult = await harness.executeQuery<SplitTransactionResult>(
      SPLIT_TRANSACTION,
      {
        input: {
          transactionId: transaction.id,
          parts: [
            { amount: 30, description: 'Part A' },
            { amount: 40, description: 'Part B' },
          ],
        },
      },
    );

    expect(splitResult.errors).toBeUndefined();
    const splitData = splitResult.data?.splitTransaction;
    const splitIds = splitData?.splitTransactions.map((st) => st.id) ?? [];

    // Query the source transaction - its siblings should be the two splits
    const sourceQuery = await harness.executeQuery<GetTransactionResult>(
      GET_TRANSACTION,
      { id: transaction.id },
    );

    expect(sourceQuery.data?.transaction).not.toBeNull();
    const sourceSiblings =
      sourceQuery.data?.transaction?.siblingTransactions ?? [];
    expect(sourceSiblings).toHaveLength(2);

    const siblingIds = sourceSiblings.map((sib) => sib.id).sort();
    expect(siblingIds).toEqual(splitIds.sort());

    const siblingA = sourceSiblings.find((sib) => sib.description === 'Part A');
    expect(siblingA?.amount).toBe(30);
    const siblingB = sourceSiblings.find((sib) => sib.description === 'Part B');
    expect(siblingB?.amount).toBe(40);

    // Query a split transaction - its siblings should be the source and the other split
    expect(splitIds).toHaveLength(2);
    const splitOneId = splitIds[0];
    const splitTwoId = splitIds[1];
    if (!splitOneId || !splitTwoId) {
      throw new Error('Split IDs not found');
    }

    const splitOneQuery = await harness.executeQuery<GetTransactionResult>(
      GET_TRANSACTION,
      { id: splitOneId },
    );

    expect(splitOneQuery.data?.transaction).not.toBeNull();
    const splitOneSiblings =
      splitOneQuery.data?.transaction?.siblingTransactions ?? [];
    expect(splitOneSiblings).toHaveLength(2);

    const splitOneSiblingIds = splitOneSiblings.map((sib) => sib.id).sort();
    expect(splitOneSiblingIds).toEqual([transaction.id, splitTwoId].sort());
  });

  test('should reject when split amounts exceed original', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create transaction: 100.00 UAH (10000 minor units)
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original Purchase',
    });

    // Try to split with amounts that exceed the original: 60 + 50 = 110 > 100
    const result = await harness.executeQuery(SPLIT_TRANSACTION, {
      input: {
        transactionId: transaction.id,
        parts: [
          { amount: 60, description: 'Part A' },
          { amount: 50, description: 'Part B' },
        ],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('exceeds');
  });

  test('should reject when split amounts equal original (no remainder)', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create transaction: 100.00 UAH
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original Purchase',
    });

    // Try to split with amounts that equal the original: 60 + 40 = 100
    const result = await harness.executeQuery(SPLIT_TRANSACTION, {
      input: {
        transactionId: transaction.id,
        parts: [
          { amount: 60, description: 'Part A' },
          { amount: 40, description: 'Part B' },
        ],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('exceeds');
  });

  test('should reject when splitting a transfer transaction', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Transfer',
    });

    // Manually update type to 'transfer' in DB
    const { transactions: txTable } = await import(
      '@modules/database/schema/index.ts'
    );
    const { eq } = await import('drizzle-orm');
    await harness
      .getDb()
      .update(txTable)
      .set({ type: 'transfer' })
      .where(eq(txTable.id, transaction.id));

    const result = await harness.executeQuery(SPLIT_TRANSACTION, {
      input: {
        transactionId: transaction.id,
        parts: [{ amount: 30, description: 'Part A' }],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('cannot be split');
  });

  test('should reject when part amount is zero or negative', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original',
    });

    const result = await harness.executeQuery(SPLIT_TRANSACTION, {
      input: {
        transactionId: transaction.id,
        parts: [{ amount: 0, description: 'Zero amount' }],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('positive');
  });

  test('should reject when transaction does not exist', async () => {
    const result = await harness.executeQuery(SPLIT_TRANSACTION, {
      input: {
        transactionId: 999999,
        parts: [{ amount: 30, description: 'Part A' }],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });
});
