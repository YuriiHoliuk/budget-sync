/**
 * API Integration Tests for transactionLink Query
 *
 * Tests the GraphQL transactionLink(id) query against real database.
 *
 * Run with: bun test tests/integration/api/transaction-link-query.test.ts
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

describe('Query: transactionLink', () => {
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

  test('should return a transaction link by id with all fields', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Test Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -50000,
      type: 'debit',
      counterparty: 'Transfer out',
    });

    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 50000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const link = await createTestTransactionLink(harness.getDb(), {
      linkType: 'transfer',
      notes: 'Monthly transfer between accounts',
      members: [
        { transactionId: outgoingTx.id, role: 'outgoing' },
        { transactionId: incomingTx.id, role: 'incoming' },
      ],
    });

    const result = await harness.executeQuery<{
      transactionLink: {
        id: string;
        linkType: string;
        notes: string;
        createdAt: string;
        members: Array<{ transactionId: string; role: string }>;
      };
    }>(
      `
        query TransactionLink($id: ID!) {
          transactionLink(id: $id) {
            id
            linkType
            notes
            createdAt
            members {
              transactionId
              role
            }
          }
        }
      `,
      { id: String(link.id) },
    );

    expect(result.errors).toBeUndefined();
    const returnedLink = result.data?.transactionLink;
    expect(returnedLink).toBeDefined();
    expect(returnedLink?.id).toBe(String(link.id));
    expect(returnedLink?.linkType).toBe('TRANSFER');
    expect(returnedLink?.notes).toBe('Monthly transfer between accounts');
    expect(returnedLink?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    expect(returnedLink?.members).toHaveLength(2);

    const outgoingMember = returnedLink?.members.find(
      (member) => member.role === 'OUTGOING',
    );
    const incomingMember = returnedLink?.members.find(
      (member) => member.role === 'INCOMING',
    );

    expect(outgoingMember).toBeDefined();
    expect(outgoingMember?.transactionId).toBe(String(outgoingTx.externalId));

    expect(incomingMember).toBeDefined();
    expect(incomingMember?.transactionId).toBe(String(incomingTx.externalId));
  });

  test('should return null for non-existent link', async () => {
    const result = await harness.executeQuery<{
      transactionLink: {
        id: string;
        linkType: string;
      } | null;
    }>(
      `
        query TransactionLink($id: ID!) {
          transactionLink(id: $id) {
            id
            linkType
          }
        }
      `,
      { id: '99999' },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.transactionLink).toBeNull();
  });
});
