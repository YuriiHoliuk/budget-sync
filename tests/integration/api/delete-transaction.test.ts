/**
 * API Integration Tests for Delete Transaction Mutation
 *
 * Tests the GraphQL deleteTransaction mutation.
 *
 * Run with: bun test tests/integration/api/delete-transaction.test.ts
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

const DELETE_MUTATION = `
  mutation DeleteTransaction($id: Int!) {
    deleteTransaction(id: $id)
  }
`;

describe('Mutation: deleteTransaction', () => {
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

  test('deletes transaction on manual account', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Cash',
      source: 'manual',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
    });

    const result = await harness.executeQuery<{ deleteTransaction: boolean }>(
      DELETE_MUTATION,
      { id: transaction.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteTransaction).toBe(true);

    const lookup = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>('query Tx($id: Int!) { transaction(id: $id) { id } }', {
      id: transaction.id,
    });
    expect(lookup.data?.transaction).toBeNull();
  });

  test('rejects deletion on bank-synced account', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Bank Account',
      source: 'bank_sync',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
    });

    const result = await harness.executeQuery<{ deleteTransaction: boolean }>(
      DELETE_MUTATION,
      { id: transaction.id },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('manual');
    expect(result.data?.deleteTransaction ?? null).toBeNull();

    const lookup = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>('query Tx($id: Int!) { transaction(id: $id) { id } }', {
      id: transaction.id,
    });
    expect(lookup.data?.transaction?.id).toBe(transaction.id);
  });

  test('returns error when transaction does not exist', async () => {
    const result = await harness.executeQuery<{ deleteTransaction: boolean }>(
      DELETE_MUTATION,
      { id: 999_999 },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Transaction not found');
  });
});
