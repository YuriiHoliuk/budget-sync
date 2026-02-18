/**
 * API Integration Tests for Mark As Transfer / Unmark Transfer Mutations
 *
 * Tests the GraphQL markAsTransfer and unmarkTransfer mutations.
 *
 * Run with: bun test tests/integration/api/mark-as-transfer.test.ts
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

const MARK_AS_TRANSFER = `
  mutation MarkAsTransfer($outgoingTransactionId: Int!, $incomingTransactionId: Int!) {
    markAsTransfer(outgoingTransactionId: $outgoingTransactionId, incomingTransactionId: $incomingTransactionId)
  }
`;

const UNMARK_TRANSFER = `
  mutation UnmarkTransfer($outgoingTransactionId: Int!, $incomingTransactionId: Int!) {
    unmarkTransfer(outgoingTransactionId: $outgoingTransactionId, incomingTransactionId: $incomingTransactionId)
  }
`;

const GET_TRANSACTION = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      type
    }
  }
`;

describe('Mutation: markAsTransfer', () => {
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

  test('should mark two transactions as a transfer pair', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Main Account',
    });
    const secondAccount = await createTestAccount(harness.getDb(), {
      name: 'Savings Account',
    });

    const outgoing = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -50000,
    });

    const incoming = await createTestTransaction(harness.getDb(), {
      accountId: secondAccount.id,
      accountExternalId: secondAccount.externalId,
      type: 'credit',
      amount: 50000,
    });

    const result = await harness.executeQuery<{
      markAsTransfer: boolean;
    }>(MARK_AS_TRANSFER, {
      outgoingTransactionId: outgoing.id,
      incomingTransactionId: incoming.id,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsTransfer).toBe(true);

    const outgoingResult = await harness.executeQuery<{
      transaction: { id: number; type: string };
    }>(GET_TRANSACTION, { id: outgoing.id });

    const incomingResult = await harness.executeQuery<{
      transaction: { id: number; type: string };
    }>(GET_TRANSACTION, { id: incoming.id });

    expect(outgoingResult.data?.transaction.type).toBe('TRANSFER');
    expect(incomingResult.data?.transaction.type).toBe('TRANSFER');
  });
});

describe('Mutation: unmarkTransfer', () => {
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

  test('should unmark a transfer pair', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Main Account',
    });
    const secondAccount = await createTestAccount(harness.getDb(), {
      name: 'Savings Account',
    });

    const outgoing = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -50000,
    });

    const incoming = await createTestTransaction(harness.getDb(), {
      accountId: secondAccount.id,
      accountExternalId: secondAccount.externalId,
      type: 'credit',
      amount: 50000,
    });

    // First mark as transfer
    const markResult = await harness.executeQuery<{
      markAsTransfer: boolean;
    }>(MARK_AS_TRANSFER, {
      outgoingTransactionId: outgoing.id,
      incomingTransactionId: incoming.id,
    });

    expect(markResult.errors).toBeUndefined();
    expect(markResult.data?.markAsTransfer).toBe(true);

    // Then unmark transfer
    const unmarkResult = await harness.executeQuery<{
      unmarkTransfer: boolean;
    }>(UNMARK_TRANSFER, {
      outgoingTransactionId: outgoing.id,
      incomingTransactionId: incoming.id,
    });

    expect(unmarkResult.errors).toBeUndefined();
    expect(unmarkResult.data?.unmarkTransfer).toBe(true);

    const outgoingResult = await harness.executeQuery<{
      transaction: { id: number; type: string };
    }>(GET_TRANSACTION, { id: outgoing.id });

    const incomingResult = await harness.executeQuery<{
      transaction: { id: number; type: string };
    }>(GET_TRANSACTION, { id: incoming.id });

    expect(outgoingResult.data?.transaction.type).toBe('DEBIT');
    expect(incomingResult.data?.transaction.type).toBe('CREDIT');
  });

  test('should return error for non-existent transaction', async () => {
    const result = await harness.executeQuery<{
      markAsTransfer: boolean;
    }>(MARK_AS_TRANSFER, {
      outgoingTransactionId: 999999,
      incomingTransactionId: 999998,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
