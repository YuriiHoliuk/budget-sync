/**
 * API Integration Tests for Mark As Returning / Unmark Returning Mutations
 *
 * Tests the GraphQL markAsReturning and unmarkReturning mutations.
 *
 * Run with: bun test tests/integration/api/mark-as-returning.test.ts
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
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const MARK_AS_RETURNING_MUTATION = `
  mutation MarkAsReturning($returningTransactionId: Int!, $originalTransactionId: Int!) {
    markAsReturning(returningTransactionId: $returningTransactionId, originalTransactionId: $originalTransactionId)
  }
`;

const UNMARK_RETURNING_MUTATION = `
  mutation UnmarkReturning($transactionId: Int!) {
    unmarkReturning(transactionId: $transactionId)
  }
`;

const GET_TRANSACTION_QUERY = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      type
      adjustedTransactionId
    }
  }
`;

describe('Mutation: markAsReturning', () => {
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

  test('should mark transaction as returning', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const originalTransaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -15000,
      type: 'debit',
    });
    const returningTransaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 15000,
      type: 'credit',
    });

    const result = await harness.executeQuery<{
      markAsReturning: boolean;
    }>(MARK_AS_RETURNING_MUTATION, {
      returningTransactionId: returningTransaction.id,
      originalTransactionId: originalTransaction.id,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning).toBe(true);

    const queryResult = await harness.executeQuery<{
      transaction: {
        id: number;
        type: string;
        adjustedTransactionId: number | null;
      };
    }>(GET_TRANSACTION_QUERY, { id: returningTransaction.id });

    expect(queryResult.errors).toBeUndefined();
    expect(queryResult.data?.transaction.type).toBe('RETURNING');
    expect(queryResult.data?.transaction.adjustedTransactionId).toBe(
      originalTransaction.id,
    );
  });

  test('should succeed silently for non-existent transaction', async () => {
    const result = await harness.executeQuery<{
      markAsReturning: boolean;
    }>(MARK_AS_RETURNING_MUTATION, {
      returningTransactionId: 999999,
      originalTransactionId: 999998,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning).toBe(true);
  });
});

describe('Mutation: unmarkReturning', () => {
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

  test('should unmark a returning transaction', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const originalTransaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -15000,
      type: 'debit',
    });
    const returningTransaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 15000,
      type: 'credit',
    });

    // First, mark as returning
    const markResult = await harness.executeQuery<{
      markAsReturning: boolean;
    }>(MARK_AS_RETURNING_MUTATION, {
      returningTransactionId: returningTransaction.id,
      originalTransactionId: originalTransaction.id,
    });

    expect(markResult.errors).toBeUndefined();
    expect(markResult.data?.markAsReturning).toBe(true);

    // Then, unmark returning
    const unmarkResult = await harness.executeQuery<{
      unmarkReturning: boolean;
    }>(UNMARK_RETURNING_MUTATION, {
      transactionId: returningTransaction.id,
    });

    expect(unmarkResult.errors).toBeUndefined();
    expect(unmarkResult.data?.unmarkReturning).toBe(true);

    const queryResult = await harness.executeQuery<{
      transaction: {
        id: number;
        type: string;
        adjustedTransactionId: number | null;
      };
    }>(GET_TRANSACTION_QUERY, { id: returningTransaction.id });

    expect(queryResult.errors).toBeUndefined();
    expect(queryResult.data?.transaction.type).toBe('CREDIT');
    expect(queryResult.data?.transaction.adjustedTransactionId).toBeNull();
  });
});
