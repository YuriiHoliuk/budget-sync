/**
 * API Integration Tests for Transaction Query (Single)
 *
 * Tests the GraphQL transaction query (fetch single transaction by ID).
 *
 * Run with: bun test tests/integration/api/transaction-query.test.ts
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

describe('Query: transaction', () => {
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
    expect(result.data?.transaction?.counterpartyName).toBe('Test Transaction');
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
