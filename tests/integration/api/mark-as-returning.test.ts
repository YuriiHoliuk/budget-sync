/**
 * API Integration Tests for Mark as Returning and Revert Returning Mutations
 *
 * Tests the GraphQL markAsReturning and revertReturning mutations.
 * Covers partial returns, full returns, validation errors, returningInfo field
 * resolver, and reverting a partial return.
 *
 * Run with: bun test tests/integration/api/mark-as-returning.test.ts
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
  createTestBankTransaction,
  createTestTransaction,
  createTestTransactionSource,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const MARK_AS_RETURNING = `
  mutation MarkAsReturning($input: MarkAsReturningInput!) {
    markAsReturning(input: $input) {
      type
      originalTransaction {
        id
        amount
        type
      }
      returningAmount
      originalAmount
      newOriginalAmount
    }
  }
`;

const REVERT_RETURNING = `
  mutation RevertReturning($transactionId: Int!) {
    revertReturning(transactionId: $transactionId) {
      transaction {
        id
        amount
        type
      }
      createdTransactions {
        id
        amount
        type
      }
    }
  }
`;

const GET_TRANSACTION = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      amount
      type
      returningInfo {
        isRevertible
        returningAmount
      }
      bankTransactions {
        id
        returnHistory {
          originalBankTransactionId
          returningBankTransactionId
          amount
        }
      }
    }
  }
`;

describe('Mutation: markAsReturning', () => {
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

  test('should handle partial return: reduce original amount, delete returning, re-link bank txns', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create debit transaction (original expense): 100.00 UAH
    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000, // 100.00 UAH in minor units
      counterparty: 'Shop',
    });

    // Create credit transaction (returning): 30.00 UAH
    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 3000, // 30.00 UAH in minor units
      counterparty: 'Shop Refund',
    });

    // Create bank transactions linked to both
    const originalBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: originalTx.id,
      bankTransactionId: originalBankTx.id,
    });

    const returningBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: 3000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: returningTx.id,
      bankTransactionId: returningBankTx.id,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        originalTransaction: {
          id: number;
          amount: number;
          type: string;
        } | null;
        returningAmount: number;
        originalAmount: number;
        newOriginalAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    expect(result.errors).toBeUndefined();
    const data = result.data?.markAsReturning;
    expect(data?.type).toBe('PARTIAL');
    expect(data?.returningAmount).toBe(30); // 30.00 major units
    expect(data?.originalAmount).toBe(100); // 100.00 major units
    expect(data?.newOriginalAmount).toBe(70); // 70.00 major units
    expect(data?.originalTransaction).not.toBeNull();
    expect(data?.originalTransaction?.id).toBe(originalTx.id);
    expect(data?.originalTransaction?.type).toBe('DEBIT');

    // Verify the returning transaction was deleted
    const returningQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: returningTx.id });
    expect(returningQuery.data?.transaction).toBeNull();

    // Verify the returning bank transaction is now linked to the original
    const originalQuery = await harness.executeQuery<{
      transaction: {
        id: number;
        returningInfo: {
          isRevertible: boolean;
          returningAmount: number;
        } | null;
        bankTransactions: Array<{
          id: number;
          returnHistory: Array<{
            originalBankTransactionId: number;
            returningBankTransactionId: number;
            amount: number;
          }>;
        }>;
      };
    }>(GET_TRANSACTION, { id: originalTx.id });
    expect(originalQuery.data?.transaction).not.toBeNull();
    expect(originalQuery.data?.transaction?.returningInfo).not.toBeNull();
    expect(originalQuery.data?.transaction?.returningInfo?.isRevertible).toBe(
      true,
    );
    expect(
      originalQuery.data?.transaction?.returningInfo?.returningAmount,
    ).toBe(30);

    // Verify returnHistory exists on bank transactions
    const allReturnHistories =
      originalQuery.data?.transaction?.bankTransactions.flatMap(
        (bt) => bt.returnHistory,
      ) ?? [];
    expect(allReturnHistories.length).toBeGreaterThanOrEqual(1);
    expect(allReturnHistories[0]?.amount).toBe(30);
    expect(allReturnHistories[0]?.originalBankTransactionId).toBe(
      originalBankTx.id,
    );
    expect(allReturnHistories[0]?.returningBankTransactionId).toBe(
      returningBankTx.id,
    );
  });

  test('should handle full return: delete both transactions', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create debit and credit with same absolute amount: 50.00 UAH
    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -5000,
      counterparty: 'Shop',
    });

    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 5000,
      counterparty: 'Shop Refund',
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        originalTransaction: { id: number } | null;
        returningAmount: number;
        originalAmount: number;
        newOriginalAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    expect(result.errors).toBeUndefined();
    const data = result.data?.markAsReturning;
    expect(data?.type).toBe('FULL');
    expect(data?.returningAmount).toBe(50);
    expect(data?.originalAmount).toBe(50);
    expect(data?.newOriginalAmount).toBeNull();
    expect(data?.originalTransaction).toBeNull();

    // Both transactions should be deleted
    const originalQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: originalTx.id });
    expect(originalQuery.data?.transaction).toBeNull();

    const returningQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: returningTx.id });
    expect(returningQuery.data?.transaction).toBeNull();
  });

  test('should reject when returning transaction is not credit', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const debitTx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });

    const debitTx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -5000,
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: debitTx2.id,
        originalTransactionId: debitTx1.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'must be a credit transaction',
    );
  });

  test('should reject when original transaction is not debit', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const creditTx1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 10000,
    });

    const creditTx2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 5000,
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: creditTx2.id,
        originalTransactionId: creditTx1.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'must be a debit transaction',
    );
  });

  test('should reject when transactions belong to different accounts', async () => {
    const account1 = await createTestAccount(harness.getDb(), {
      name: 'Card 1',
      source: 'bank_sync',
    });
    const account2 = await createTestAccount(harness.getDb(), {
      name: 'Card 2',
      source: 'bank_sync',
    });

    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account1.id,
      accountExternalId: account1.externalId,
      type: 'debit',
      amount: -10000,
    });

    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account2.id,
      accountExternalId: account2.externalId,
      type: 'credit',
      amount: 5000,
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('same account');
  });

  test('should reject when returning amount exceeds original amount', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -5000, // 50.00 UAH
    });

    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 10000, // 100.00 UAH — more than original
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('exceeds original amount');
  });

  test('should populate returningInfo field resolver after partial return', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -20000, // 200.00 UAH
    });

    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 7500, // 75.00 UAH
    });

    // Create and link a bank transaction for the returning side
    const returningBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: 7500,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: returningTx.id,
      bankTransactionId: returningBankTx.id,
    });

    // Perform partial return
    await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    // Query the original transaction and verify returningInfo
    const txResult = await harness.executeQuery<{
      transaction: {
        id: number;
        amount: number;
        type: string;
        returningInfo: {
          isRevertible: boolean;
          returningAmount: number;
        } | null;
      };
    }>(GET_TRANSACTION, { id: originalTx.id });

    expect(txResult.data?.transaction).not.toBeNull();
    expect(txResult.data?.transaction?.returningInfo).not.toBeNull();
    expect(txResult.data?.transaction?.returningInfo?.isRevertible).toBe(true);
    expect(txResult.data?.transaction?.returningInfo?.returningAmount).toBe(75);
  });
});

describe('Mutation: revertReturning', () => {
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

  test('should revert partial return: restore original amount and re-create credit transaction', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create debit transaction (original expense): 100.00 UAH
    const originalTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
      counterparty: 'Shop',
    });

    // Create credit transaction (returning): 30.00 UAH
    const returningTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 3000,
      counterparty: 'Shop Refund',
    });

    // Create and link bank transactions
    const originalBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: originalTx.id,
      bankTransactionId: originalBankTx.id,
    });

    const returningBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: 3000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: returningTx.id,
      bankTransactionId: returningBankTx.id,
    });

    // First, mark as returning (partial)
    const markResult = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        newOriginalAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        returningTransactionId: returningTx.id,
        originalTransactionId: originalTx.id,
      },
    });

    expect(markResult.errors).toBeUndefined();
    expect(markResult.data?.markAsReturning.type).toBe('PARTIAL');
    expect(markResult.data?.markAsReturning.newOriginalAmount).toBe(70);

    // Now revert the returning
    const revertResult = await harness.executeQuery<{
      revertReturning: {
        transaction: {
          id: number;
          amount: number;
          type: string;
        };
        createdTransactions: Array<{
          id: number;
          amount: number;
          type: string;
        }>;
      };
    }>(REVERT_RETURNING, {
      transactionId: originalTx.id,
    });

    expect(revertResult.errors).toBeUndefined();
    expect(revertResult.data?.revertReturning.transaction.id).toBe(
      originalTx.id,
    );
    expect(revertResult.data?.revertReturning.transaction.type).toBe('DEBIT');
    // Original amount should be restored: 70.00 (reduced) + 30.00 (returning) = 100.00
    expect(revertResult.data?.revertReturning.transaction.amount).toBe(100);

    // Should have created 1 credit transaction for the unlinked bank txn
    expect(revertResult.data?.revertReturning.createdTransactions).toHaveLength(
      1,
    );
    expect(
      revertResult.data?.revertReturning.createdTransactions[0]?.type,
    ).toBe('CREDIT');
    expect(
      revertResult.data?.revertReturning.createdTransactions[0]?.amount,
    ).toBe(30);

    // Verify returningInfo is now null (no more credit bank txns linked)
    const txQuery = await harness.executeQuery<{
      transaction: {
        id: number;
        returningInfo: {
          isRevertible: boolean;
          returningAmount: number;
        } | null;
        bankTransactions: Array<{
          id: number;
          returnHistory: Array<{
            originalBankTransactionId: number;
            returningBankTransactionId: number;
            amount: number;
          }>;
        }>;
      };
    }>(GET_TRANSACTION, { id: originalTx.id });

    expect(txQuery.data?.transaction?.returningInfo).toBeNull();

    // Verify returnHistory is empty after revert
    const allReturnHistories =
      txQuery.data?.transaction?.bankTransactions.flatMap(
        (bt) => bt.returnHistory,
      ) ?? [];
    expect(allReturnHistories).toHaveLength(0);
  });

  test('should reject revert when transaction is not debit', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 5000,
    });

    const result = await harness.executeQuery(REVERT_RETURNING, {
      transactionId: creditTx.id,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'must be a debit transaction',
    );
  });

  test('should reject revert when no returning bank transactions exist', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Create a debit transaction with only a debit bank transaction (no credit ones)
    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const result = await harness.executeQuery(REVERT_RETURNING, {
      transactionId: debitTx.id,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'no returning bank transactions',
    );
  });
});
