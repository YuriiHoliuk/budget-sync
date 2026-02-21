/**
 * API Integration Tests for Convert to Transfer Mutation
 *
 * Tests the GraphQL convertToTransfer mutation.
 *
 * Run with: bun test tests/integration/api/convert-to-transfer.test.ts
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

describe('Mutation: convertToTransfer', () => {
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

  test('should convert a DEBIT transaction to transfer', async () => {
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

    const result = await harness.executeQuery<{
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

    expect(result.errors).toBeUndefined();
    expect(result.data?.convertToTransfer.sourceTransaction.type).toBe(
      'TRANSFER',
    );
    expect(result.data?.convertToTransfer.counterpartTransaction.type).toBe(
      'TRANSFER',
    );

    // Verify transfer pair info is available
    const txResult = await harness.executeQuery<{
      transaction: {
        id: number;
        type: string;
        transferPair: {
          pairedTransactionId: number;
          pairedAccountName: string;
          isRevertible: boolean;
        };
      };
    }>(GET_TRANSACTION, { id: transaction.id });

    expect(txResult.data?.transaction.type).toBe('TRANSFER');
    expect(txResult.data?.transaction.transferPair).not.toBeNull();
    expect(txResult.data?.transaction.transferPair?.pairedAccountName).toBe(
      'Cash',
    );
    expect(txResult.data?.transaction.transferPair?.isRevertible).toBe(true);

    // Verify destination account balance increased
    const accountResult = await harness.executeQuery<{
      account: { id: number; balance: number };
    }>(GET_ACCOUNT, { id: destinationAccount.id });

    // Original balance: 50000 minor = 500.00 major, plus 10000 minor = 100.00 major
    // balance in GQL is in major units: 600.00
    expect(accountResult.data?.account.balance).toBe(600);
  });

  test('should convert a CREDIT transaction to transfer', async () => {
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
      type: 'credit',
      amount: 10000,
    });

    const result = await harness.executeQuery<{
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

    expect(result.errors).toBeUndefined();
    expect(result.data?.convertToTransfer.sourceTransaction.type).toBe(
      'TRANSFER',
    );

    // Verify destination account balance decreased
    const accountResult = await harness.executeQuery<{
      account: { id: number; balance: number };
    }>(GET_ACCOUNT, { id: destinationAccount.id });

    // Original: 500.00, minus 100.00 = 400.00
    expect(accountResult.data?.account.balance).toBe(400);
  });

  test('should reject conversion of already-transfer transaction', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Account A',
    });
    const destinationAccount = await createTestAccount(harness.getDb(), {
      name: 'Cash',
      source: 'manual',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      type: 'debit',
      amount: -10000,
    });

    // First convert succeeds
    await harness.executeQuery(CONVERT_TO_TRANSFER, {
      input: {
        transactionId: transaction.id,
        destinationAccountId: destinationAccount.id,
      },
    });

    // Second convert should fail
    const result = await harness.executeQuery(CONVERT_TO_TRANSFER, {
      input: {
        transactionId: transaction.id,
        destinationAccountId: destinationAccount.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('already a transfer');
  });

  test('should reject conversion to synced account', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'Account A',
    });
    const syncedDestination = await createTestAccount(harness.getDb(), {
      name: 'Synced Account',
      source: 'bank_sync',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      type: 'debit',
      amount: -10000,
    });

    const result = await harness.executeQuery(CONVERT_TO_TRANSFER, {
      input: {
        transactionId: transaction.id,
        destinationAccountId: syncedDestination.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('not allowed');
  });

  test('should reject conversion with currency mismatch', async () => {
    const sourceAccount = await createTestAccount(harness.getDb(), {
      name: 'UAH Account',
      currency: 'UAH',
    });
    const usdAccount = await createTestAccount(harness.getDb(), {
      name: 'USD Cash',
      source: 'manual',
      currency: 'USD',
    });

    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: sourceAccount.id,
      accountExternalId: sourceAccount.externalId,
      type: 'debit',
      amount: -10000,
      currency: 'UAH',
    });

    const result = await harness.executeQuery(CONVERT_TO_TRANSFER, {
      input: {
        transactionId: transaction.id,
        destinationAccountId: usdAccount.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Currency mismatch');
  });
});
