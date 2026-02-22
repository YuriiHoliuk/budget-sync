/**
 * API Integration Tests for Join Transactions Mutation
 *
 * Tests the GraphQL joinTransactions mutation.
 * Setup: create an account + transaction, split it, then join.
 * Covers: happy path (join one split back), sibling list update,
 * source deletion, and validation errors (not siblings, self-join).
 *
 * Run with: bun test tests/integration/api/join-transactions.test.ts
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
      }
      splitTransactions {
        id
        amount
        description
      }
    }
  }
`;

const JOIN_TRANSACTIONS = `
  mutation JoinTransactions($input: JoinTransactionsInput!) {
    joinTransactions(input: $input) {
      id
      amount
      type
      description
      siblingTransactions {
        id
        amount
        description
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
      }
    }
  }
`;

interface SplitResult {
  splitTransaction: {
    sourceTransaction: { id: number; amount: number };
    splitTransactions: Array<{
      id: number;
      amount: number;
      description: string;
    }>;
  };
}

interface JoinResult {
  joinTransactions: {
    id: number;
    amount: number;
    type: string;
    description: string;
    siblingTransactions: Array<{
      id: number;
      amount: number;
      description: string;
    }>;
  };
}

interface GetTransactionResult {
  transaction: {
    id: number;
    amount: number;
    type: string;
    description: string;
    siblingTransactions: Array<{
      id: number;
      amount: number;
      description: string;
    }>;
  } | null;
}

describe('Mutation: joinTransactions', () => {
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

  test('should join a split transaction back into the source', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create a 100.00 UAH transaction
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000, // 100.00 UAH
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

    // Split into 2 parts: 30 + 40, leaving remainder of 30
    const splitResult = await harness.executeQuery<SplitResult>(
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
    const splitPartA = splitData?.splitTransactions.find(
      (sp) => sp.description === 'Part A',
    );
    const splitPartB = splitData?.splitTransactions.find(
      (sp) => sp.description === 'Part B',
    );

    if (!splitPartA || !splitPartB) {
      throw new Error('Split parts not found');
    }

    // Join Part A back into the source
    const joinResult = await harness.executeQuery<JoinResult>(
      JOIN_TRANSACTIONS,
      {
        input: {
          targetTransactionId: transaction.id,
          sourceTransactionId: splitPartA.id,
        },
      },
    );

    expect(joinResult.errors).toBeUndefined();
    const joinData = joinResult.data?.joinTransactions;

    // Target amount should be: source remainder (30) + Part A (30) = 60
    expect(joinData?.id).toBe(transaction.id);
    expect(joinData?.amount).toBe(60);
    expect(joinData?.type).toBe('DEBIT');

    // Siblings should now only contain Part B
    expect(joinData?.siblingTransactions).toHaveLength(1);
    expect(joinData?.siblingTransactions[0]?.id).toBe(splitPartB.id);
    expect(joinData?.siblingTransactions[0]?.amount).toBe(40);
  });

  test('should delete the source transaction after join', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original Purchase',
    });

    const bankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTx.id,
    });

    // Split into 1 part: 30, remainder = 70
    const splitResult = await harness.executeQuery<SplitResult>(
      SPLIT_TRANSACTION,
      {
        input: {
          transactionId: transaction.id,
          parts: [{ amount: 30, description: 'Split Part' }],
        },
      },
    );

    expect(splitResult.errors).toBeUndefined();
    const splitPartId =
      splitResult.data?.splitTransaction.splitTransactions[0]?.id;
    if (!splitPartId) {
      throw new Error('Split part not found');
    }

    // Join the split back into the source
    const joinResult = await harness.executeQuery<JoinResult>(
      JOIN_TRANSACTIONS,
      {
        input: {
          targetTransactionId: transaction.id,
          sourceTransactionId: splitPartId,
        },
      },
    );

    expect(joinResult.errors).toBeUndefined();
    expect(joinResult.data?.joinTransactions.amount).toBe(100); // 70 + 30 = 100

    // The split transaction should be deleted (query returns null)
    const deletedQuery = await harness.executeQuery<GetTransactionResult>(
      GET_TRANSACTION,
      { id: splitPartId },
    );
    expect(deletedQuery.data?.transaction).toBeNull();
  });

  test('should update siblings list after join', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Original Purchase',
    });

    const bankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTx.id,
    });

    // Split into 3 parts: 20 + 20 + 20, remainder = 40
    const splitResult = await harness.executeQuery<SplitResult>(
      SPLIT_TRANSACTION,
      {
        input: {
          transactionId: transaction.id,
          parts: [
            { amount: 20, description: 'Part A' },
            { amount: 20, description: 'Part B' },
            { amount: 20, description: 'Part C' },
          ],
        },
      },
    );

    expect(splitResult.errors).toBeUndefined();
    const splitParts = splitResult.data?.splitTransaction.splitTransactions;
    const partA = splitParts?.find((sp) => sp.description === 'Part A');
    const partB = splitParts?.find((sp) => sp.description === 'Part B');
    const partC = splitParts?.find((sp) => sp.description === 'Part C');

    if (!partA || !partB || !partC) {
      throw new Error('Split parts not found');
    }

    // Join Part A back into the source
    await harness.executeQuery<JoinResult>(JOIN_TRANSACTIONS, {
      input: {
        targetTransactionId: transaction.id,
        sourceTransactionId: partA.id,
      },
    });

    // Query Part B - its siblings should be: source + Part C (Part A is gone)
    const partBQuery = await harness.executeQuery<GetTransactionResult>(
      GET_TRANSACTION,
      { id: partB.id },
    );

    expect(partBQuery.data?.transaction).not.toBeNull();
    const partBSiblings =
      partBQuery.data?.transaction?.siblingTransactions ?? [];
    expect(partBSiblings).toHaveLength(2);

    const partBSiblingIds = partBSiblings.map((sib) => sib.id).sort();
    expect(partBSiblingIds).toEqual([transaction.id, partC.id].sort());
  });

  test('should reject when transactions are not siblings', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create two unrelated transactions
    const transaction1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Purchase 1',
    });

    const transaction2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 5000,
      bankDescription: 'Purchase 2',
    });

    const result = await harness.executeQuery(JOIN_TRANSACTIONS, {
      input: {
        targetTransactionId: transaction1.id,
        sourceTransactionId: transaction2.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('cannot be joined');
  });

  test('should reject joining a transaction with itself', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Purchase',
    });

    const result = await harness.executeQuery(JOIN_TRANSACTIONS, {
      input: {
        targetTransactionId: transaction.id,
        sourceTransactionId: transaction.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'cannot be joined with itself',
    );
  });

  test('should reject when target transaction does not exist', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Purchase',
    });

    const result = await harness.executeQuery(JOIN_TRANSACTIONS, {
      input: {
        targetTransactionId: 999999,
        sourceTransactionId: transaction.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not found');
  });

  test('should reject when target transaction is a transfer', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create two transactions linked to the same bank transaction
    const transaction1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 10000,
      bankDescription: 'Transfer Out',
    });

    const transaction2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: 5000,
      bankDescription: 'Related',
    });

    // Make them siblings by linking to the same bank transaction
    const bankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -15000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction1.id,
      bankTransactionId: bankTx.id,
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction2.id,
      bankTransactionId: bankTx.id,
    });

    // Manually set the target to transfer type
    const { transactions: txTable } = await import(
      '@modules/database/schema/index.ts'
    );
    const { eq } = await import('drizzle-orm');
    await harness
      .getDb()
      .update(txTable)
      .set({ type: 'transfer' })
      .where(eq(txTable.id, transaction1.id));

    const result = await harness.executeQuery(JOIN_TRANSACTIONS, {
      input: {
        targetTransactionId: transaction1.id,
        sourceTransactionId: transaction2.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('transfer');
  });
});
