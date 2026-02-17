/**
 * API Integration Tests for Transaction Bank Transactions Field
 *
 * Tests the bankTransactions and bankTransactionCount fields on the Transaction GraphQL type.
 *
 * Run with: bun test tests/integration/api/transaction-bank-transactions.test.ts
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

const GET_TRANSACTION_WITH_BANK_TRANSACTIONS = `
  query GetTransaction($id: Int!) {
    transaction(id: $id) {
      id
      bankTransactionCount
      bankTransactions {
        id
        externalId
        amount
        currency
        type
        bankDescription
        counterparty
        commission
      }
    }
  }
`;

interface BankTransactionGql {
  id: number;
  externalId: string;
  amount: number;
  currency: string;
  type: string;
  bankDescription: string | null;
  counterparty: string | null;
  commission: number | null;
}

interface TransactionWithBankTransactions {
  transaction: {
    id: number;
    bankTransactionCount: number;
    bankTransactions: BankTransactionGql[];
  } | null;
}

describe('Transaction: bankTransactions field', () => {
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

  test('should return linked bank transactions', async () => {
    const account = await createTestAccount(harness.getDb());
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
    });
    const bankTransaction = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      externalId: 'mono-tx-001',
      amount: -15000,
      currency: 'UAH',
      type: 'debit',
      bankDescription: 'Silpo supermarket',
      counterparty: 'Silpo',
      commission: 0,
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTransaction.id,
    });

    const result = await harness.executeQuery<TransactionWithBankTransactions>(
      GET_TRANSACTION_WITH_BANK_TRANSACTIONS,
      { id: transaction.id },
    );

    expect(result.errors).toBeUndefined();
    const txn = result.data?.transaction;
    expect(txn).not.toBeNull();
    expect(txn?.bankTransactions).toHaveLength(1);

    const returnedBankTxn = txn?.bankTransactions[0];
    expect(returnedBankTxn?.externalId).toBe('mono-tx-001');
    expect(returnedBankTxn?.amount).toBe(-150);
    expect(returnedBankTxn?.currency).toBe('UAH');
    expect(returnedBankTxn?.type).toBe('DEBIT');
    expect(returnedBankTxn?.bankDescription).toBe('Silpo supermarket');
    expect(returnedBankTxn?.counterparty).toBe('Silpo');
    expect(returnedBankTxn?.commission).toBe(0);
  });

  test('should return bankTransactionCount', async () => {
    const account = await createTestAccount(harness.getDb());
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
    });

    const bankTransaction1 = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      externalId: 'mono-tx-101',
      amount: -10000,
    });
    const bankTransaction2 = await createTestBankTransaction(harness.getDb(), {
      accountId: account.id,
      externalId: 'mono-tx-102',
      amount: -5000,
    });

    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTransaction1.id,
    });
    await createTestTransactionSource(harness.getDb(), {
      transactionId: transaction.id,
      bankTransactionId: bankTransaction2.id,
    });

    const result = await harness.executeQuery<TransactionWithBankTransactions>(
      GET_TRANSACTION_WITH_BANK_TRANSACTIONS,
      { id: transaction.id },
    );

    expect(result.errors).toBeUndefined();
    const txn = result.data?.transaction;
    expect(txn).not.toBeNull();
    expect(txn?.bankTransactionCount).toBe(2);
    expect(txn?.bankTransactions).toHaveLength(2);
  });

  test('should return empty array when no bank transactions linked', async () => {
    const account = await createTestAccount(harness.getDb());
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
    });

    const result = await harness.executeQuery<TransactionWithBankTransactions>(
      GET_TRANSACTION_WITH_BANK_TRANSACTIONS,
      { id: transaction.id },
    );

    expect(result.errors).toBeUndefined();
    const txn = result.data?.transaction;
    expect(txn).not.toBeNull();
    expect(txn?.bankTransactionCount).toBe(0);
    expect(txn?.bankTransactions).toEqual([]);
  });
});
