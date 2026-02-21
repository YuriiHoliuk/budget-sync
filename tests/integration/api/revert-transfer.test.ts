/**
 * API Integration Tests for Revert Transfer Mutation
 *
 * Tests the GraphQL revertTransfer mutation.
 *
 * Run with: bun test tests/integration/api/revert-transfer.test.ts
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
  createTestTransferPair,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const CONVERT_TO_TRANSFER = `
  mutation ConvertToTransfer($input: ConvertToTransferInput!) {
    convertToTransfer(input: $input) {
      sourceTransaction {
        id
        type
      }
      counterpartTransaction {
        id
        type
      }
    }
  }
`;

const REVERT_TRANSFER = `
  mutation RevertTransfer($transactionId: Int!) {
    revertTransfer(transactionId: $transactionId) {
      id
      type
    }
  }
`;

const GET_TRANSACTION = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      type
      transferPair {
        pairedTransactionId
        pairedAccountName
        isRevertible
      }
    }
  }
`;

const GET_ACCOUNT = `
  query GetAccount($id: Int!) {
    account(id: $id) {
      id
      balance
    }
  }
`;

describe('Mutation: revertTransfer', () => {
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

  test('should revert a manually-converted transfer', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });
    const destinationAccount = await createTestAccount(harness.getDb(), {
      name: 'Cash',
      source: 'manual',
      balance: 50000,
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      type: 'debit',
      amount: -10000,
    });

    // First convert to transfer
    const convertResult = await harness.executeQuery<{
      convertToTransfer: {
        sourceTransaction: { id: number; type: string };
        counterpartTransaction: { id: number; type: string };
      };
    }>(CONVERT_TO_TRANSFER, {
      input: {
        transactionId: transaction.id,
        destinationAccountId: destinationAccount.id,
      },
    });

    expect(convertResult.errors).toBeUndefined();

    // Destination balance should be 600.00 after conversion
    const afterConvert = await harness.executeQuery<{
      account: { id: number; balance: number };
    }>(GET_ACCOUNT, { id: destinationAccount.id });
    expect(afterConvert.data?.account.balance).toBe(600);

    // Now revert
    const revertResult = await harness.executeQuery<{
      revertTransfer: { id: number; type: string };
    }>(REVERT_TRANSFER, {
      transactionId: transaction.id,
    });

    expect(revertResult.errors).toBeUndefined();
    expect(revertResult.data?.revertTransfer.type).toBe('DEBIT');

    // Verify source transaction is back to DEBIT
    const txResult = await harness.executeQuery<{
      transaction: {
        id: number;
        type: string;
        transferPair: null;
      };
    }>(GET_TRANSACTION, { id: transaction.id });

    expect(txResult.data?.transaction.type).toBe('DEBIT');
    expect(txResult.data?.transaction.transferPair).toBeNull();

    // Verify destination balance reverted back to 500.00
    const afterRevert = await harness.executeQuery<{
      account: { id: number; balance: number };
    }>(GET_ACCOUNT, { id: destinationAccount.id });
    expect(afterRevert.data?.account.balance).toBe(500);
  });

  test('should reject reverting an auto-detected transfer', async () => {
    const accountA = await createTestAccount(harness.getDb(), {
      name: 'Account A',
      source: 'bank_sync',
    });
    const accountB = await createTestAccount(harness.getDb(), {
      name: 'Account B',
      source: 'bank_sync',
    });

    // Create two transactions that look like auto-detected transfer
    const outgoing = await createTestTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      externalId: `mono-out-${Date.now()}`,
      type: 'debit',
      amount: -10000,
    });

    const incoming = await createTestTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      externalId: `mono-in-${Date.now()}`,
      type: 'credit',
      amount: 10000,
    });

    // Manually create transfer pair (simulating auto-detection)
    await createTestTransferPair(harness.getDb(), {
      outgoingTransactionId: outgoing.id,
      incomingTransactionId: incoming.id,
    });

    const result = await harness.executeQuery(REVERT_TRANSFER, {
      transactionId: outgoing.id,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'only manually converted transfers',
    );
  });

  test('should return error for non-transfer transaction', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });

    const result = await harness.executeQuery(REVERT_TRANSFER, {
      transactionId: transaction.id,
    });

    expect(result.errors).toBeDefined();
  });
});
