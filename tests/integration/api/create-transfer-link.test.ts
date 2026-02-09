/**
 * API Integration Tests for createTransferLink Mutation
 *
 * Tests the GraphQL createTransferLink mutation against real database.
 *
 * Run with: bun test tests/integration/api/create-transfer-link.test.ts
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

describe('Mutation: createTransferLink', () => {
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

  test('should create a transfer link between two transactions', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Source Account',
    });
    const destAccount = await createTestAccount(harness.getDb(), {
      name: 'Destination Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      amount: -50000,
      type: 'debit',
      counterparty: 'Transfer out',
    });
    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: destAccount.id,
      accountExternalId: destAccount.externalId,
      amount: 50000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const result = await harness.executeQuery<{
      createTransferLink: {
        id: string;
        linkType: string;
        notes: string | null;
        members: Array<{ transactionId: string; role: string }>;
        createdAt: string;
      };
    }>(
      `
        mutation CreateTransferLink($outgoingTransactionId: ID!, $incomingTransactionId: ID!) {
          createTransferLink(outgoingTransactionId: $outgoingTransactionId, incomingTransactionId: $incomingTransactionId) {
            id
            linkType
            notes
            members {
              transactionId
              role
            }
            createdAt
          }
        }
      `,
      {
        outgoingTransactionId: outgoingTx.externalId,
        incomingTransactionId: incomingTx.externalId,
      },
    );

    expect(result.errors).toBeUndefined();
    const link = result.data?.createTransferLink;
    expect(link).toBeDefined();
    expect(link?.linkType).toBe('TRANSFER');
    expect(link?.notes).toBeNull();
    expect(link?.createdAt).toBeDefined();
    expect(link?.members).toHaveLength(2);

    const outgoingMember = link?.members.find(
      (member) => member.role === 'OUTGOING',
    );
    const incomingMember = link?.members.find(
      (member) => member.role === 'INCOMING',
    );

    expect(outgoingMember).toBeDefined();
    expect(incomingMember).toBeDefined();
  });

  test('should create a transfer link with notes', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Source Account',
    });
    const destAccount = await createTestAccount(harness.getDb(), {
      name: 'Destination Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      amount: -30000,
      type: 'debit',
      counterparty: 'Transfer out',
    });
    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: destAccount.id,
      accountExternalId: destAccount.externalId,
      amount: 30000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const notesText = 'Monthly savings transfer';
    const result = await harness.executeQuery<{
      createTransferLink: {
        id: string;
        linkType: string;
        notes: string | null;
      };
    }>(
      `
        mutation CreateTransferLink($outgoingTransactionId: ID!, $incomingTransactionId: ID!, $notes: String) {
          createTransferLink(outgoingTransactionId: $outgoingTransactionId, incomingTransactionId: $incomingTransactionId, notes: $notes) {
            id
            linkType
            notes
          }
        }
      `,
      {
        outgoingTransactionId: outgoingTx.externalId,
        incomingTransactionId: incomingTx.externalId,
        notes: notesText,
      },
    );

    expect(result.errors).toBeUndefined();
    const link = result.data?.createTransferLink;
    expect(link).toBeDefined();
    expect(link?.notes).toBe(notesText);
    expect(link?.linkType).toBe('TRANSFER');
  });

  test('should return link with all fields populated', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Source Account',
    });
    const destAccount = await createTestAccount(harness.getDb(), {
      name: 'Destination Account',
    });

    const outgoingTx = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      amount: -25000,
      type: 'debit',
      counterparty: 'Transfer out',
    });
    const incomingTx = await createTestTransaction(harness.getDb(), {
      accountId: destAccount.id,
      accountExternalId: destAccount.externalId,
      amount: 25000,
      type: 'credit',
      counterparty: 'Transfer in',
    });

    const result = await harness.executeQuery<{
      createTransferLink: {
        id: string;
        linkType: string;
        notes: string | null;
        members: Array<{ transactionId: string; role: string }>;
        createdAt: string;
      };
    }>(
      `
        mutation CreateTransferLink($outgoingTransactionId: ID!, $incomingTransactionId: ID!, $notes: String) {
          createTransferLink(outgoingTransactionId: $outgoingTransactionId, incomingTransactionId: $incomingTransactionId, notes: $notes) {
            id
            linkType
            notes
            members {
              transactionId
              role
            }
            createdAt
          }
        }
      `,
      {
        outgoingTransactionId: outgoingTx.externalId,
        incomingTransactionId: incomingTx.externalId,
        notes: 'Complete field test',
      },
    );

    expect(result.errors).toBeUndefined();
    const link = result.data?.createTransferLink;
    expect(link).toBeDefined();

    expect(typeof link?.id).toBe('string');
    expect(link?.id).not.toBe('');
    expect(link?.linkType).toBe('TRANSFER');
    expect(link?.notes).toBe('Complete field test');

    expect(link?.members).toHaveLength(2);
    for (const member of link?.members ?? []) {
      expect(typeof member.transactionId).toBe('string');
      expect(member.transactionId).not.toBe('');
      expect(['OUTGOING', 'INCOMING']).toContain(member.role);
    }

    expect(typeof link?.createdAt).toBe('string');
    expect(new Date(link?.createdAt ?? '').toString()).not.toBe('Invalid Date');
  });
});
