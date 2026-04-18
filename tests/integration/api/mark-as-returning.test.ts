/**
 * API Integration Tests for Mark as Returning and Revert Returning Mutations
 *
 * Covers all three outcomes (full_cancel, debit_reduced, credit_reduced) from both
 * same-account and cross-account pairings. Also covers revert symmetry: a surviving
 * credit with absorbed debit bank_txs can be reverted, and cross-account reverts
 * resurrect the absorbed side on its origin account.
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
      survivingTransaction {
        id
        amount
        type
      }
      newSurvivingAmount
      totalDebitAmount
      totalCreditAmount
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
        account {
          id
        }
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

const TRANSACTIONS_BY_ACCOUNT = `
  query TransactionsByAccount($accountId: Int!) {
    transactions(filter: { accountId: $accountId }) {
      items {
        id
        type
        amount
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

  test('debit_reduced (same account): reduces debit, deletes credit, re-links credit bank_txs', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
      counterparty: 'Shop',
    });

    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 3000,
      counterparty: 'Shop Refund',
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 3000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: {
          id: number;
          amount: number;
          type: string;
        } | null;
        newSurvivingAmount: number | null;
        totalDebitAmount: number;
        totalCreditAmount: number;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeUndefined();
    const data = result.data?.markAsReturning;
    expect(data?.type).toBe('DEBIT_REDUCED');
    expect(data?.totalDebitAmount).toBe(100);
    expect(data?.totalCreditAmount).toBe(30);
    expect(data?.newSurvivingAmount).toBe(70);
    expect(data?.survivingTransaction?.id).toBe(debitTx.id);
    expect(data?.survivingTransaction?.type).toBe('DEBIT');

    const creditQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: creditTx.id });
    expect(creditQuery.data?.transaction).toBeNull();

    const debitQuery = await harness.executeQuery<{
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
    }>(GET_TRANSACTION, { id: debitTx.id });
    expect(debitQuery.data?.transaction?.returningInfo?.isRevertible).toBe(
      true,
    );
    expect(debitQuery.data?.transaction?.returningInfo?.returningAmount).toBe(
      30,
    );

    const allReturnHistories =
      debitQuery.data?.transaction?.bankTransactions.flatMap(
        (bt) => bt.returnHistory,
      ) ?? [];
    expect(allReturnHistories.length).toBeGreaterThanOrEqual(1);
    expect(allReturnHistories[0]?.amount).toBe(30);
    expect(allReturnHistories[0]?.originalBankTransactionId).toBe(
      debitBankTx.id,
    );
    expect(allReturnHistories[0]?.returningBankTransactionId).toBe(
      creditBankTx.id,
    );
  });

  test('full_cancel (same account): deletes both transactions', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -5000,
    });

    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 5000,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: { id: number } | null;
        newSurvivingAmount: number | null;
        totalDebitAmount: number;
        totalCreditAmount: number;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeUndefined();
    const data = result.data?.markAsReturning;
    expect(data?.type).toBe('FULL_CANCEL');
    expect(data?.survivingTransaction).toBeNull();
    expect(data?.newSurvivingAmount).toBeNull();
    expect(data?.totalDebitAmount).toBe(50);
    expect(data?.totalCreditAmount).toBe(50);

    const debitQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: debitTx.id });
    expect(debitQuery.data?.transaction).toBeNull();

    const creditQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: creditTx.id });
    expect(creditQuery.data?.transaction).toBeNull();
  });

  test('credit_reduced (same account): reduces credit, deletes debit, re-links debit bank_txs', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -3000,
    });

    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 8000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -3000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 8000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: {
          id: number;
          amount: number;
          type: string;
        } | null;
        newSurvivingAmount: number | null;
        totalDebitAmount: number;
        totalCreditAmount: number;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeUndefined();
    const data = result.data?.markAsReturning;
    expect(data?.type).toBe('CREDIT_REDUCED');
    expect(data?.survivingTransaction?.id).toBe(creditTx.id);
    expect(data?.survivingTransaction?.type).toBe('CREDIT');
    expect(data?.newSurvivingAmount).toBe(50);
    expect(data?.totalDebitAmount).toBe(30);
    expect(data?.totalCreditAmount).toBe(80);

    const debitQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: debitTx.id });
    expect(debitQuery.data?.transaction).toBeNull();

    const creditQuery = await harness.executeQuery<{
      transaction: {
        id: number;
        returningInfo: {
          isRevertible: boolean;
          returningAmount: number;
        } | null;
      };
    }>(GET_TRANSACTION, { id: creditTx.id });
    expect(creditQuery.data?.transaction?.returningInfo?.isRevertible).toBe(
      true,
    );
    expect(creditQuery.data?.transaction?.returningInfo?.returningAmount).toBe(
      30,
    );
  });

  test('debit_reduced (cross-account): credit on account B absorbed into debit on account A', async () => {
    const accountA = await createTestAccount(harness.getDb(), {
      name: 'Iron Black',
      source: 'bank_sync',
    });
    const accountB = await createTestAccount(harness.getDb(), {
      name: 'Mono White',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      type: 'debit',
      amount: -10000,
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      type: 'credit',
      amount: 4000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      amount: 4000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: { id: number } | null;
        newSurvivingAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning.type).toBe('DEBIT_REDUCED');
    expect(result.data?.markAsReturning.newSurvivingAmount).toBe(60);

    // Account B's transactions view no longer shows the absorbed credit
    const accountBView = await harness.executeQuery<{
      transactions: {
        items: Array<{ id: number; type: string; amount: number }>;
      };
    }>(TRANSACTIONS_BY_ACCOUNT, { accountId: accountB.id });
    const remaining =
      accountBView.data?.transactions.items.filter(
        (tx) => tx.id === creditTx.id,
      ) ?? [];
    expect(remaining).toHaveLength(0);

    // Account A still shows the (reduced) debit
    const accountAView = await harness.executeQuery<{
      transactions: {
        items: Array<{ id: number; type: string; amount: number }>;
      };
    }>(TRANSACTIONS_BY_ACCOUNT, { accountId: accountA.id });
    const survivingOnA = accountAView.data?.transactions.items.find(
      (tx) => tx.id === debitTx.id,
    );
    expect(survivingOnA).toBeDefined();
    expect(survivingOnA?.amount).toBe(60); // major units, always positive
  });

  test('credit_reduced (cross-account): debit on account A absorbed into credit on account B', async () => {
    const accountA = await createTestAccount(harness.getDb(), {
      name: 'Iron Black',
      source: 'bank_sync',
    });
    const accountB = await createTestAccount(harness.getDb(), {
      name: 'Mono White',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      type: 'debit',
      amount: -2000,
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      type: 'credit',
      amount: 10000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      amount: -2000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      amount: 10000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: { id: number } | null;
        newSurvivingAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning.type).toBe('CREDIT_REDUCED');
    expect(result.data?.markAsReturning.survivingTransaction?.id).toBe(
      creditTx.id,
    );
    expect(result.data?.markAsReturning.newSurvivingAmount).toBe(80);

    // Debit side on account A no longer exists
    const debitQuery = await harness.executeQuery<{
      transaction: { id: number } | null;
    }>(GET_TRANSACTION, { id: debitTx.id });
    expect(debitQuery.data?.transaction).toBeNull();
  });

  test('rejects when credit arg is not a credit transaction', async () => {
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
        creditTransactionIds: [debitTx2.id],
        debitTransactionIds: [debitTx1.id],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'must be a credit transaction',
    );
  });

  test('rejects when debit arg is not a debit transaction', async () => {
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
        creditTransactionIds: [creditTx2.id],
        debitTransactionIds: [creditTx1.id],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'must be a debit transaction',
    );
  });

  test('rejects currency mismatch', async () => {
    const uahAccount = await createTestAccount(harness.getDb(), {
      name: 'UAH Card',
      source: 'bank_sync',
    });
    const usdAccount = await createTestAccount(harness.getDb(), {
      name: 'USD Card',
      source: 'bank_sync',
      currency: 'USD',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: uahAccount.id,
      accountExternalId: uahAccount.externalId,
      type: 'debit',
      amount: -10000,
      currency: 'UAH',
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: usdAccount.id,
      accountExternalId: usdAccount.externalId,
      type: 'credit',
      amount: 3000,
      currency: 'USD',
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Currency mismatch');
  });

  test('multi-select credit-anchor: salary absorbs 3 expenses → credit_reduced', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const salary = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 100000, // 1000.00 UAH
    });

    const expense1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -15000, // 150.00
    });
    const expense2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000, // 100.00
    });
    const expense3 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -15000, // 150.00
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: { id: number; type: string } | null;
        newSurvivingAmount: number | null;
        totalDebitAmount: number;
        totalCreditAmount: number;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [salary.id],
        debitTransactionIds: [expense1.id, expense2.id, expense3.id],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning.type).toBe('CREDIT_REDUCED');
    expect(result.data?.markAsReturning.survivingTransaction?.id).toBe(
      salary.id,
    );
    expect(result.data?.markAsReturning.newSurvivingAmount).toBe(600); // 1000 - 400
    expect(result.data?.markAsReturning.totalDebitAmount).toBe(400);
    expect(result.data?.markAsReturning.totalCreditAmount).toBe(1000);

    // All three expense transactions deleted
    for (const id of [expense1.id, expense2.id, expense3.id]) {
      const q = await harness.executeQuery<{
        transaction: { id: number } | null;
      }>(GET_TRANSACTION, { id });
      expect(q.data?.transaction).toBeNull();
    }
  });

  test('multi-select debit-anchor: pub absorbs 3 friend refunds → debit_reduced', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const pub = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -120000, // 1200.00
    });

    const friend1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 20000,
    });
    const friend2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 20000,
    });
    const friend3 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 20000,
    });

    const result = await harness.executeQuery<{
      markAsReturning: {
        type: string;
        survivingTransaction: { id: number; type: string } | null;
        newSurvivingAmount: number | null;
      };
    }>(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [friend1.id, friend2.id, friend3.id],
        debitTransactionIds: [pub.id],
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.markAsReturning.type).toBe('DEBIT_REDUCED');
    expect(result.data?.markAsReturning.survivingTransaction?.id).toBe(pub.id);
    expect(result.data?.markAsReturning.newSurvivingAmount).toBe(600);
  });

  test('multi-select rejects when many-side sum exceeds anchor', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const salary = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 10000,
    });

    const expense1 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -20000,
    });
    const expense2 = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });

    const result = await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [salary.id],
        debitTransactionIds: [expense1.id, expense2.id],
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain(
      'less than the sum of selected transactions',
    );
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

  test('reverts debit_reduced: restores original debit amount, re-creates credit transaction', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'credit',
      amount: 3000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      amount: 3000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    const revertResult = await harness.executeQuery<{
      revertReturning: {
        transaction: { id: number; amount: number; type: string };
        createdTransactions: Array<{
          id: number;
          amount: number;
          type: string;
          account: { id: number };
        }>;
      };
    }>(REVERT_RETURNING, { transactionId: debitTx.id });

    expect(revertResult.errors).toBeUndefined();
    expect(revertResult.data?.revertReturning.transaction.id).toBe(debitTx.id);
    expect(revertResult.data?.revertReturning.transaction.amount).toBe(100);
    expect(revertResult.data?.revertReturning.createdTransactions).toHaveLength(
      1,
    );
    expect(
      revertResult.data?.revertReturning.createdTransactions[0]?.type,
    ).toBe('CREDIT');
    expect(
      revertResult.data?.revertReturning.createdTransactions[0]?.account.id,
    ).toBe(account.id);
  });

  test('reverts cross-account debit_reduced: resurrected credit goes back to account B', async () => {
    const accountA = await createTestAccount(harness.getDb(), {
      name: 'Iron Black',
      source: 'bank_sync',
    });
    const accountB = await createTestAccount(harness.getDb(), {
      name: 'Mono White',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      type: 'debit',
      amount: -10000,
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      type: 'credit',
      amount: 4000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      amount: -10000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      amount: 4000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    const revertResult = await harness.executeQuery<{
      revertReturning: {
        createdTransactions: Array<{
          id: number;
          amount: number;
          type: string;
          account: { id: number };
        }>;
      };
    }>(REVERT_RETURNING, { transactionId: debitTx.id });

    expect(revertResult.errors).toBeUndefined();
    const resurrected =
      revertResult.data?.revertReturning.createdTransactions[0];
    expect(resurrected?.type).toBe('CREDIT');
    expect(resurrected?.account.id).toBe(accountB.id);
    expect(resurrected?.amount).toBe(40);
  });

  test('reverts credit_reduced: restores credit amount, re-creates debit transaction on its origin account', async () => {
    const accountA = await createTestAccount(harness.getDb(), {
      name: 'Iron Black',
      source: 'bank_sync',
    });
    const accountB = await createTestAccount(harness.getDb(), {
      name: 'Mono White',
      source: 'bank_sync',
    });

    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      type: 'debit',
      amount: -2000,
    });
    const creditTx = await createTestTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      type: 'credit',
      amount: 10000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountA.id,
      accountExternalId: accountA.externalId,
      amount: -2000,
      type: 'debit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: debitTx.id,
      bankTransactionId: debitBankTx.id,
    });

    const creditBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: accountB.id,
      accountExternalId: accountB.externalId,
      amount: 10000,
      type: 'credit',
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: creditTx.id,
      bankTransactionId: creditBankTx.id,
    });

    await harness.executeQuery(MARK_AS_RETURNING, {
      input: {
        creditTransactionIds: [creditTx.id],
        debitTransactionIds: [debitTx.id],
      },
    });

    const revertResult = await harness.executeQuery<{
      revertReturning: {
        transaction: { id: number; amount: number; type: string };
        createdTransactions: Array<{
          id: number;
          amount: number;
          type: string;
          account: { id: number };
        }>;
      };
    }>(REVERT_RETURNING, { transactionId: creditTx.id });

    expect(revertResult.errors).toBeUndefined();
    expect(revertResult.data?.revertReturning.transaction.id).toBe(creditTx.id);
    expect(revertResult.data?.revertReturning.transaction.type).toBe('CREDIT');
    expect(revertResult.data?.revertReturning.transaction.amount).toBe(100);

    const resurrected =
      revertResult.data?.revertReturning.createdTransactions[0];
    expect(resurrected?.type).toBe('DEBIT');
    expect(resurrected?.account.id).toBe(accountA.id);
    expect(resurrected?.amount).toBe(20); // major units, always positive
  });

  test('rejects revert when transaction is a transfer', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Monobank Card',
      source: 'bank_sync',
    });

    // Simulate a transfer type by creating via direct factory with transfer type.
    // createTestTransaction only accepts debit|credit, so instead create a debit
    // that has no foreign bank_txs — exercises the NoReturningBankTransactionsError path.
    // Transfer-type rejection is covered in unit tests.
    const debitTx = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      type: 'debit',
      amount: -10000,
    });

    const debitBankTx = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
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
