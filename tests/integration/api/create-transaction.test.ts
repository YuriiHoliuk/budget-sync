/**
 * API Integration Tests for Create Transaction Mutation
 *
 * Tests the GraphQL createTransaction mutation.
 *
 * Run with: bun test tests/integration/api/create-transaction.test.ts
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
import { clearAllTestData, createTestAccount } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: createTransaction', () => {
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
    expect(result.data?.createTransaction.description).toBe('Coffee purchase');
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
