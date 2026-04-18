import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { RevertReturningUseCase } from '@application/use-cases/RevertReturning.ts';
import { BankTransaction } from '@domain/entities/BankTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  NoReturningBankTransactionsError,
  TransactionIsTransferError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';

function createMockTransactionRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: 1,
    externalId: 'tx-123',
    date: new Date('2024-03-15'),
    amount: -5000,
    currency: 'UAH',
    type: 'debit',
    accountId: 10,
    accountExternalId: 'acc-123',
    categoryId: null,
    budgetId: null,
    categorizationStatus: 'pending',
    categoryReason: null,
    budgetReason: null,
    mcc: 5411,
    bankDescription: 'Test Transaction',
    counterparty: 'Test Counterparty',
    counterpartyIban: null,
    hold: false,
    cashback: null,
    commission: null,
    receiptId: null,
    notes: null,
    bankTransactionCount: 0,
    ...overrides,
  };
}

function createMockBankTransaction(
  overrides: Partial<{
    id: number;
    externalId: string;
    accountId: number;
    accountExternalId: string;
    date: Date;
    amount: Money;
    currency: Currency;
    type: TransactionType;
    bankDescription: string;
  }> = {},
): BankTransaction {
  return BankTransaction.create(
    {
      externalId: overrides.externalId ?? 'bank-tx-1',
      accountId: overrides.accountId ?? 10,
      accountExternalId: overrides.accountExternalId ?? 'acc-123',
      date: overrides.date ?? new Date('2024-03-15'),
      amount: overrides.amount ?? Money.create(3000, Currency.UAH),
      currency: overrides.currency ?? Currency.UAH,
      type: overrides.type ?? TransactionType.CREDIT,
      bankDescription: overrides.bankDescription ?? 'Return payment',
    },
    overrides.id ?? 100,
  );
}

describe('RevertReturningUseCase', () => {
  let useCase: RevertReturningUseCase;
  let mockTransactionRepository: TransactionRepository;
  let mockBankTransactionRepository: BankTransactionRepository;

  beforeEach(() => {
    mockTransactionRepository = {
      findById: mock(() => Promise.resolve(null)),
      findByDbId: mock(() => Promise.resolve(null)),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByExternalIds: mock(() => Promise.resolve(new Map())),
      findByAccountId: mock(() => Promise.resolve([])),
      findAll: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveAndReturn: mock((transaction: Transaction) =>
        Promise.resolve(transaction.withDbId(200)),
      ),
      saveMany: mock(() => Promise.resolve()),
      saveManyAndReturn: mock((transactions: Transaction[]) =>
        Promise.resolve(
          transactions.map((txn: Transaction, idx: number) =>
            txn.withDbId(200 + idx),
          ),
        ),
      ),
      update: mock(() => Promise.resolve()),
      updateMany: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
      updateCategorization: mock(() => Promise.resolve()),
      findByCategorizationStatus: mock(() => Promise.resolve([])),
      findUncategorized: mock(() => Promise.resolve([])),
      findRecordById: mock(() => Promise.resolve(null)),
      findRecordsFiltered: mock(() => Promise.resolve([])),
      countFiltered: mock(() => Promise.resolve(0)),
      updateRecordCategory: mock(() => Promise.resolve(null)),
      updateRecordBudget: mock(() => Promise.resolve(null)),
      updateRecordStatus: mock(() => Promise.resolve(null)),
      updateRecordNotes: mock(() => Promise.resolve(null)),
      updateRecordType: mock(() => Promise.resolve()),
      createTransferPair: mock(() => Promise.resolve()),
      deleteTransferPair: mock(() => Promise.resolve()),
      findTransferPairByTransactionId: mock(() => Promise.resolve(null)),
      findTransferCandidate: mock(() => Promise.resolve(null)),
      findCancellationCandidate: mock(() => Promise.resolve(null)),
      updateTransactionAmount: mock(() => Promise.resolve()),
      findTransactionSummaries: mock(() => Promise.resolve([])),
      countByBudgetId: mock(() => Promise.resolve(new Map())),
      countByCategoryId: mock(() => Promise.resolve(new Map())),
    } as unknown as TransactionRepository;

    mockBankTransactionRepository = {
      save: mock(() => Promise.resolve()),
      saveMany: mock(() => Promise.resolve([])),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByExternalIds: mock(() => Promise.resolve(new Map())),
      findByAccountAndDateRange: mock(() => Promise.resolve([])),
      findByTransactionId: mock(() => Promise.resolve([])),
      linkTransactionSource: mock(() => Promise.resolve()),
      linkTransactionSources: mock(() => Promise.resolve()),
      unlinkTransactionSource: mock(() => Promise.resolve()),
      saveReturn: mock(() => Promise.resolve()),
      deleteReturnsByReturningBankTransactionId: mock(() => Promise.resolve()),
      findReturnsByBankTransactionIds: mock(() => Promise.resolve([])),
    } as unknown as BankTransactionRepository;

    useCase = new RevertReturningUseCase(
      mockTransactionRepository,
      mockBankTransactionRepository,
    );
  });

  test('reverts debit_reduced: unlinks credit bank_txs, recreates credits, restores debit amount', async () => {
    const survivingDebit = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-debit',
      type: 'debit',
      amount: -2000,
      currency: 'UAH',
      accountId: 10,
      accountExternalId: 'acc-123',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(survivingDebit);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      externalId: 'bank-debit-1',
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
      accountExternalId: 'acc-123',
    });
    const creditBankTx1 = createMockBankTransaction({
      id: 100,
      externalId: 'bank-credit-1',
      type: TransactionType.CREDIT,
      amount: Money.create(2000, Currency.UAH),
      accountExternalId: 'acc-123',
      bankDescription: 'Refund 1',
    });
    const creditBankTx2 = createMockBankTransaction({
      id: 101,
      externalId: 'bank-credit-2',
      type: TransactionType.CREDIT,
      amount: Money.create(1000, Currency.UAH),
      accountExternalId: 'acc-123',
      bankDescription: 'Refund 2',
    });

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([debitBankTx, creditBankTx1, creditBankTx2]);

    await useCase.execute({ transactionId: 1 });

    expect(
      mockBankTransactionRepository.unlinkTransactionSource,
    ).toHaveBeenCalledTimes(2);
    expect(
      mockBankTransactionRepository.unlinkTransactionSource,
    ).toHaveBeenCalledWith(1, 100);
    expect(
      mockBankTransactionRepository.unlinkTransactionSource,
    ).toHaveBeenCalledWith(1, 101);

    const saveAndReturnCalls = (
      mockTransactionRepository.saveAndReturn as ReturnType<typeof mock>
    ).mock.calls;
    expect(saveAndReturnCalls).toHaveLength(2);

    const firstSaved = saveAndReturnCalls[0]?.[0] as Transaction;
    expect(firstSaved.externalId).toBe('bank-credit-1');
    expect(firstSaved.amount.amount).toBe(2000);
    expect(firstSaved.type).toBe(TransactionType.CREDIT);
    expect(firstSaved.accountId).toBe('acc-123');

    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(1, 5000);
  });

  test('cross-account revert uses each bank_tx own accountExternalId, not the surviving record', async () => {
    const survivingDebit = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-debit',
      type: 'debit',
      amount: -2000,
      currency: 'UAH',
      accountId: 10,
      accountExternalId: 'acc-iron-black',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(survivingDebit);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      externalId: 'bank-debit',
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
      accountExternalId: 'acc-iron-black',
    });
    // Refund bank_tx came from a DIFFERENT account (Mono White)
    const refundBankTx = createMockBankTransaction({
      id: 100,
      externalId: 'bank-refund-mono',
      type: TransactionType.CREDIT,
      amount: Money.create(3000, Currency.UAH),
      accountExternalId: 'acc-mono-white',
      bankDescription: 'Friend refund',
    });

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([debitBankTx, refundBankTx]);

    await useCase.execute({ transactionId: 1 });

    const saveAndReturnCalls = (
      mockTransactionRepository.saveAndReturn as ReturnType<typeof mock>
    ).mock.calls;
    expect(saveAndReturnCalls).toHaveLength(1);

    const recreated = saveAndReturnCalls[0]?.[0] as Transaction;
    expect(recreated.accountId).toBe('acc-mono-white');
    expect(recreated.externalId).toBe('bank-refund-mono');
    expect(recreated.type).toBe(TransactionType.CREDIT);
  });

  test('reverts credit_reduced: unlinks debit bank_txs from surviving credit, recreates debits, restores credit amount', async () => {
    const survivingCredit = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-credit',
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 20,
      accountExternalId: 'acc-mono',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(survivingCredit);

    const creditBankTx = createMockBankTransaction({
      id: 60,
      externalId: 'bank-credit',
      type: TransactionType.CREDIT,
      amount: Money.create(8000, Currency.UAH),
      accountExternalId: 'acc-mono',
    });
    const foreignDebitBankTx = createMockBankTransaction({
      id: 70,
      externalId: 'bank-debit-foreign',
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
      accountExternalId: 'acc-iron',
      bankDescription: 'Absorbed expense',
    });

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([creditBankTx, foreignDebitBankTx]);

    await useCase.execute({ transactionId: 2 });

    expect(
      mockBankTransactionRepository.unlinkTransactionSource,
    ).toHaveBeenCalledWith(2, 70);

    const saveAndReturnCalls = (
      mockTransactionRepository.saveAndReturn as ReturnType<typeof mock>
    ).mock.calls;
    expect(saveAndReturnCalls).toHaveLength(1);

    const recreatedDebit = saveAndReturnCalls[0]?.[0] as Transaction;
    expect(recreatedDebit.type).toBe(TransactionType.DEBIT);
    expect(recreatedDebit.accountId).toBe('acc-iron');
    expect(recreatedDebit.amount.amount).toBe(5000);

    // Surviving credit amount restored: 3000 + 5000 = 8000
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(2, 8000);
  });

  test('throws TransactionNotFoundError when transaction not found', async () => {
    await expect(useCase.execute({ transactionId: 999 })).rejects.toThrow(
      TransactionNotFoundError,
    );
  });

  test('throws TransactionIsTransferError when transaction is a transfer', async () => {
    const transferRecord = createMockTransactionRecord({
      id: 1,
      type: 'transfer',
      amount: -5000,
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(transferRecord);

    await expect(useCase.execute({ transactionId: 1 })).rejects.toThrow(
      TransactionIsTransferError,
    );
  });

  test('throws NoReturningBankTransactionsError when no foreign bank_txs found', async () => {
    const debitRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(debitRecord);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([debitBankTx]);

    await expect(useCase.execute({ transactionId: 1 })).rejects.toThrow(
      NoReturningBankTransactionsError,
    );
  });

  test('throws when foreign bank_tx is missing accountExternalId', async () => {
    const debitRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -2000,
      currency: 'UAH',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(debitRecord);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });
    const creditBankTxWithoutAccountExt = BankTransaction.create(
      {
        externalId: 'bank-credit-no-acc',
        accountId: 30,
        // accountExternalId intentionally omitted
        date: new Date('2024-03-15'),
        amount: Money.create(3000, Currency.UAH),
        currency: Currency.UAH,
        type: TransactionType.CREDIT,
        bankDescription: 'Refund',
      },
      100,
    );

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([debitBankTx, creditBankTxWithoutAccountExt]);

    await expect(useCase.execute({ transactionId: 1 })).rejects.toThrow(
      /accountExternalId/,
    );
  });
});
