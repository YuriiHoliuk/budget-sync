import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { SplitTransactionUseCase } from '@application/use-cases/SplitTransaction.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import {
  SplitAmountExceedsOriginalError,
  SplitAmountMustBePositiveError,
  TransactionCannotBeSplitError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';

function createMockTransactionRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: 1,
    externalId: 'tx-123',
    date: new Date('2024-03-15'),
    amount: 10000,
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
    bankTransactionCount: 1,
    ...overrides,
  };
}

describe('SplitTransactionUseCase', () => {
  let useCase: SplitTransactionUseCase;
  let mockTransactionRepository: TransactionRepository;
  let mockBankTransactionRepository: BankTransactionRepository;

  let splitRecordIdCounter: number;

  beforeEach(() => {
    splitRecordIdCounter = 100;

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
      createSplitRecord: mock(() => {
        const id = splitRecordIdCounter++;
        return Promise.resolve(createMockTransactionRecord({ id }));
      }),
      findSiblingTransactions: mock(() => Promise.resolve([])),
      deleteByDbId: mock(() => Promise.resolve()),
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
    } as unknown as BankTransactionRepository;

    useCase = new SplitTransactionUseCase(
      mockTransactionRepository,
      mockBankTransactionRepository,
    );
  });

  test('should split transaction into 2 parts with correct remainder', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    // No bank transactions linked
    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([]);

    const result = await useCase.execute({
      transactionId: 1,
      parts: [
        {
          amount: 30,
          description: 'Part 1',
          categoryId: null,
          budgetId: null,
          notes: null,
        },
        {
          amount: 40,
          description: 'Part 2',
          categoryId: null,
          budgetId: null,
          notes: null,
        },
      ],
    });

    expect(result.sourceTransactionId).toBe(1);
    expect(result.splitTransactionIds).toHaveLength(2);

    // Source amount should be reduced by split sum: 10000 - 3000 - 4000 = 3000
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(1, 3000);

    // Two split records should be created
    expect(mockTransactionRepository.createSplitRecord).toHaveBeenCalledTimes(
      2,
    );
    expect(mockTransactionRepository.createSplitRecord).toHaveBeenCalledWith({
      sourceTransactionId: 1,
      amount: 3000,
      description: 'Part 1',
      categoryId: null,
      budgetId: null,
      notes: null,
    });
    expect(mockTransactionRepository.createSplitRecord).toHaveBeenCalledWith({
      sourceTransactionId: 1,
      amount: 4000,
      description: 'Part 2',
      categoryId: null,
      budgetId: null,
      notes: null,
    });
  });

  test('should split transaction into a single part', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([]);

    const result = await useCase.execute({
      transactionId: 1,
      parts: [
        {
          amount: 50,
          description: 'Single part',
          categoryId: 5,
          budgetId: 3,
          notes: 'test',
        },
      ],
    });

    expect(result.sourceTransactionId).toBe(1);
    expect(result.splitTransactionIds).toHaveLength(1);

    // Source amount: 10000 - 5000 = 5000
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(1, 5000);

    expect(mockTransactionRepository.createSplitRecord).toHaveBeenCalledWith({
      sourceTransactionId: 1,
      amount: 5000,
      description: 'Single part',
      categoryId: 5,
      budgetId: 3,
      notes: 'test',
    });
  });

  test('should throw TransactionNotFoundError when transaction not found', async () => {
    await expect(
      useCase.execute({
        transactionId: 999,
        parts: [
          {
            amount: 30,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw TransactionCannotBeSplitError when transaction is a transfer', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      type: 'transfer',
      amount: 10000,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        transactionId: 1,
        parts: [
          {
            amount: 30,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(TransactionCannotBeSplitError);
  });

  test('should throw SplitAmountMustBePositiveError when part amount is zero', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        transactionId: 1,
        parts: [
          {
            amount: 0,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(SplitAmountMustBePositiveError);
  });

  test('should throw SplitAmountMustBePositiveError when part amount is negative', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        transactionId: 1,
        parts: [
          {
            amount: -10,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(SplitAmountMustBePositiveError);
  });

  test('should throw SplitAmountExceedsOriginalError when split sum equals original amount', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    // 60 + 40 = 100 major units = 10000 minor units = entire source amount
    await expect(
      useCase.execute({
        transactionId: 1,
        parts: [
          {
            amount: 60,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
          {
            amount: 40,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(SplitAmountExceedsOriginalError);
  });

  test('should throw SplitAmountExceedsOriginalError when split sum exceeds original amount', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    // 70 + 50 = 120 major units = 12000 minor units > 10000
    await expect(
      useCase.execute({
        transactionId: 1,
        parts: [
          {
            amount: 70,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
          {
            amount: 50,
            description: null,
            categoryId: null,
            budgetId: null,
            notes: null,
          },
        ],
      }),
    ).rejects.toThrow(SplitAmountExceedsOriginalError);
  });

  test('should link bank transactions to each split record', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    // Two bank transactions linked to the source
    const bankTx1 = { id: 50, externalId: 'bank-1' };
    const bankTx2 = { id: 51, externalId: 'bank-2' };
    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([bankTx1, bankTx2]);

    // Reset the counter so we know the IDs
    splitRecordIdCounter = 100;

    const result = await useCase.execute({
      transactionId: 1,
      parts: [
        {
          amount: 30,
          description: 'Part 1',
          categoryId: null,
          budgetId: null,
          notes: null,
        },
        {
          amount: 40,
          description: 'Part 2',
          categoryId: null,
          budgetId: null,
          notes: null,
        },
      ],
    });

    expect(result.splitTransactionIds).toEqual([100, 101]);

    // Each split record should be linked to each bank transaction
    expect(
      mockBankTransactionRepository.linkTransactionSources,
    ).toHaveBeenCalledWith([
      { transactionId: 100, bankTransactionId: 50 },
      { transactionId: 100, bankTransactionId: 51 },
      { transactionId: 101, bankTransactionId: 50 },
      { transactionId: 101, bankTransactionId: 51 },
    ]);
  });

  test('should not call linkTransactionSources when no bank transactions exist', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      amount: 10000,
      type: 'debit',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    (
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([]);

    await useCase.execute({
      transactionId: 1,
      parts: [
        {
          amount: 30,
          description: null,
          categoryId: null,
          budgetId: null,
          notes: null,
        },
      ],
    });

    expect(
      mockBankTransactionRepository.linkTransactionSources,
    ).not.toHaveBeenCalled();
  });
});
