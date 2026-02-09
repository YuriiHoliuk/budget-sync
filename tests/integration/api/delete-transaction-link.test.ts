/**
 * API Integration Tests for deleteTransactionLink Mutation
 *
 * Tests the GraphQL deleteTransactionLink(id) mutation against real database.
 *
 * Run with: bun test tests/integration/api/delete-transaction-link.test.ts
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
  createTestTransactionLink,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: deleteTransactionLink', () => {
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

  test('should delete an existing transaction link', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const transaction1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -10000,
      type: 'debit',
      counterparty: 'Outgoing transfer',
    });

    const transaction2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 10000,
      type: 'credit',
      counterparty: 'Incoming transfer',
    });

    const link = await createTestTransactionLink(harness.getDb(), {
      linkType: 'transfer',
      members: [
        { transactionId: transaction1.id, role: 'outgoing' },
        { transactionId: transaction2.id, role: 'incoming' },
      ],
    });

    const result = await harness.executeQuery<{
      deleteTransactionLink: boolean;
    }>(
      `
        mutation DeleteTransactionLink($id: ID!) {
          deleteTransactionLink(id: $id)
        }
      `,
      { id: String(link.id) },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteTransactionLink).toBe(true);
  });

  test('should return false for non-existent link', async () => {
    const result = await harness.executeQuery<{
      deleteTransactionLink: boolean;
    }>(
      `
        mutation DeleteTransactionLink($id: ID!) {
          deleteTransactionLink(id: $id)
        }
      `,
      { id: '99999' },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteTransactionLink).toBe(false);
  });

  test('should remove link so it cannot be queried afterwards', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const transaction1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -5000,
      type: 'debit',
      counterparty: 'Outgoing',
    });

    const transaction2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 5000,
      type: 'credit',
      counterparty: 'Incoming',
    });

    const link = await createTestTransactionLink(harness.getDb(), {
      linkType: 'transfer',
      notes: 'Will be deleted',
      members: [
        { transactionId: transaction1.id, role: 'outgoing' },
        { transactionId: transaction2.id, role: 'incoming' },
      ],
    });

    // Delete the link
    const deleteResult = await harness.executeQuery<{
      deleteTransactionLink: boolean;
    }>(
      `
        mutation DeleteTransactionLink($id: ID!) {
          deleteTransactionLink(id: $id)
        }
      `,
      { id: String(link.id) },
    );

    expect(deleteResult.errors).toBeUndefined();
    expect(deleteResult.data?.deleteTransactionLink).toBe(true);

    // Verify it's gone
    const queryResult = await harness.executeQuery<{
      transactionLink: { id: string } | null;
    }>(
      `
        query GetTransactionLink($id: ID!) {
          transactionLink(id: $id) {
            id
          }
        }
      `,
      { id: String(link.id) },
    );

    expect(queryResult.errors).toBeUndefined();
    expect(queryResult.data?.transactionLink).toBeNull();
  });
});
