/**
 * API Integration Tests for transactionLinkByTransaction Query
 *
 * Tests the GraphQL transactionLinkByTransaction(transactionId) query against real database.
 *
 * Run with: bun test tests/integration/api/transaction-link-by-transaction-query.test.ts
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

describe('Query: transactionLinkByTransaction', () => {
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

  test('should find link by outgoing transaction id', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -10000,
      type: 'debit',
      counterparty: 'Transfer out',
    });

    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 10000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const link = await createTestTransactionLink(harness.getDb(), {
      linkType: 'transfer',
      notes: 'Test transfer',
      members: [
        { transactionId: outgoingTx.id, role: 'outgoing' },
        { transactionId: incomingTx.id, role: 'incoming' },
      ],
    });

    const result = await harness.executeQuery<{
      transactionLinkByTransaction: {
        id: string;
        linkType: string;
        notes: string | null;
        members: Array<{ transactionId: string; role: string }>;
      };
    }>(
      `
        query GetTransactionLinkByTransaction($transactionId: ID!) {
          transactionLinkByTransaction(transactionId: $transactionId) {
            id
            linkType
            notes
            members {
              transactionId
              role
            }
          }
        }
      `,
      { transactionId: String(outgoingTx.id) },
    );

    expect(result.errors).toBeUndefined();

    const returnedLink = result.data?.transactionLinkByTransaction;
    expect(returnedLink).toBeDefined();
    expect(returnedLink?.id).toBe(String(link.id));
    expect(returnedLink?.linkType).toBe('TRANSFER');
    expect(returnedLink?.notes).toBe('Test transfer');
    expect(returnedLink?.members).toHaveLength(2);

    const outgoingMember = returnedLink?.members.find(
      (member) => member.role === 'OUTGOING',
    );
    expect(outgoingMember?.transactionId).toBe(String(outgoingTx.externalId));
  });

  test('should find link by incoming transaction id', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -10000,
      type: 'debit',
      counterparty: 'Transfer out',
    });

    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 10000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const link = await createTestTransactionLink(harness.getDb(), {
      linkType: 'transfer',
      members: [
        { transactionId: outgoingTx.id, role: 'outgoing' },
        { transactionId: incomingTx.id, role: 'incoming' },
      ],
    });

    const result = await harness.executeQuery<{
      transactionLinkByTransaction: {
        id: string;
        linkType: string;
        members: Array<{ transactionId: string; role: string }>;
      };
    }>(
      `
        query GetTransactionLinkByTransaction($transactionId: ID!) {
          transactionLinkByTransaction(transactionId: $transactionId) {
            id
            linkType
            members {
              transactionId
              role
            }
          }
        }
      `,
      { transactionId: String(incomingTx.id) },
    );

    expect(result.errors).toBeUndefined();

    const returnedLink = result.data?.transactionLinkByTransaction;
    expect(returnedLink).toBeDefined();
    expect(returnedLink?.id).toBe(String(link.id));
    expect(returnedLink?.linkType).toBe('TRANSFER');
    expect(returnedLink?.members).toHaveLength(2);
  });

  test('should return null when transaction has no links', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -5000,
      type: 'debit',
      counterparty: 'Unlinked transaction',
    });

    const result = await harness.executeQuery<{
      transactionLinkByTransaction: { id: string; linkType: string } | null;
    }>(
      `
        query GetTransactionLinkByTransaction($transactionId: ID!) {
          transactionLinkByTransaction(transactionId: $transactionId) {
            id
            linkType
          }
        }
      `,
      { transactionId: String(transaction.id) },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.transactionLinkByTransaction).toBeNull();
  });

  test('should return null for non-existent transaction', async () => {
    const result = await harness.executeQuery<{
      transactionLinkByTransaction: { id: string; linkType: string } | null;
    }>(
      `
        query GetTransactionLinkByTransaction($transactionId: ID!) {
          transactionLinkByTransaction(transactionId: $transactionId) {
            id
            linkType
          }
        }
      `,
      { transactionId: '99999' },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.transactionLinkByTransaction).toBeNull();
  });
});
