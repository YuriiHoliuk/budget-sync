/**
 * API Integration Tests for Update Transaction Notes Mutation
 *
 * Tests the GraphQL updateTransactionNotes mutation.
 *
 * Run with: bun test tests/integration/api/update-transaction-notes.test.ts
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

describe('Mutation: updateTransactionNotes', () => {
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

  test('should update transaction notes', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
    });

    const result = await harness.executeQuery<{
      updateTransactionNotes: {
        id: number;
        notes: string | null;
      };
    }>(
      `
      mutation UpdateTransactionNotes($input: UpdateTransactionNotesInput!) {
        updateTransactionNotes(input: $input) {
          id
          notes
        }
      }
    `,
      {
        input: {
          id: transaction.id,
          notes: 'Important purchase',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateTransactionNotes.notes).toBe(
      'Important purchase',
    );
  });

  test('should clear transaction notes with null', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      notes: 'Some existing notes',
    });

    const result = await harness.executeQuery<{
      updateTransactionNotes: {
        id: number;
        notes: string | null;
      };
    }>(
      `
      mutation UpdateTransactionNotes($input: UpdateTransactionNotesInput!) {
        updateTransactionNotes(input: $input) {
          id
          notes
        }
      }
    `,
      {
        input: {
          id: transaction.id,
          notes: null,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateTransactionNotes.notes).toBeNull();
  });

  test('should return error for non-existent transaction', async () => {
    const result = await harness.executeQuery<{
      updateTransactionNotes: {
        id: number;
        notes: string | null;
      };
    }>(
      `
      mutation UpdateTransactionNotes($input: UpdateTransactionNotesInput!) {
        updateTransactionNotes(input: $input) {
          id
          notes
        }
      }
    `,
      {
        input: {
          id: 999999,
          notes: 'Should fail',
        },
      },
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Transaction not found');
  });
});
