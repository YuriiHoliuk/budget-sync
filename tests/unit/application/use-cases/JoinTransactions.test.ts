import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { JoinTransactionsUseCase } from '@application/use-cases/JoinTransactions.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import {
  JoinTargetIsTransferError,
  JoinTransactionCannotBeSelfError,
  JoinTransactionsNotSiblingsError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';

function createMockTransactionRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: 1,
    externalId: 'tx-123',
    date: new Date('2024-03-15'),
    amount: 5000,
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

describe('JoinTransactionsUseCase', () => {
  let useCase: JoinTransactionsUseCase;
  let mockTransactionRepository: TransactionRepository;

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
      createSplitRecord: mock(() =>
        Promise.resolve(createMockTransactionRecord()),
      ),
      findSiblingTransactions: mock(() => Promise.resolve([])),
      deleteByDbId: mock(() => Promise.resolve()),
      findTransactionSummaries: mock(() => Promise.resolve([])),
      countByBudgetId: mock(() => Promise.resolve(new Map())),
      countByCategoryId: mock(() => Promise.resolve(new Map())),
    } as unknown as TransactionRepository;

    useCase = new JoinTransactionsUseCase(mockTransactionRepository);
  });

  test('should join two sibling transactions: amounts add up, source deleted', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      amount: 3000,
      currency: 'UAH',
      type: 'debit',
    });
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      amount: 4000,
      currency: 'UAH',
      type: 'debit',
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(targetRecord);
    findRecordById.mockResolvedValueOnce(sourceRecord);

    // Source is a sibling of target
    (
      mockTransactionRepository.findSiblingTransactions as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([sourceRecord]);

    const result = await useCase.execute({
      targetTransactionId: 1,
      sourceTransactionId: 2,
    });

    expect(result.targetTransactionId).toBe(1);

    // Target amount should be updated to combined amount: 3000 + 4000 = 7000
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(1, 7000);

    // Source should be deleted
    expect(mockTransactionRepository.deleteByDbId).toHaveBeenCalledWith(2);
  });

  test('should throw JoinTransactionCannotBeSelfError when joining transaction with itself', async () => {
    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 1,
      }),
    ).rejects.toThrow(JoinTransactionCannotBeSelfError);
  });

  test('should throw TransactionNotFoundError when target transaction not found', async () => {
    await expect(
      useCase.execute({
        targetTransactionId: 999,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw TransactionNotFoundError when source transaction not found', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      amount: 3000,
      type: 'debit',
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(targetRecord);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 999,
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw JoinTargetIsTransferError when target is a transfer', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      type: 'transfer',
      amount: 3000,
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(targetRecord);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(JoinTargetIsTransferError);
  });

  test('should throw JoinTargetIsTransferError when source is a transfer', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: 3000,
    });
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      type: 'transfer',
      amount: 4000,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(targetRecord);
    findRecordById.mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(JoinTargetIsTransferError);
  });

  test('should throw JoinTransactionsNotSiblingsError when transactions are not siblings', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      amount: 3000,
      currency: 'UAH',
      type: 'debit',
    });
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      amount: 4000,
      currency: 'UAH',
      type: 'debit',
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(targetRecord);
    findRecordById.mockResolvedValueOnce(sourceRecord);

    // Return empty siblings list (source is not a sibling of target)
    (
      mockTransactionRepository.findSiblingTransactions as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce([]);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(JoinTransactionsNotSiblingsError);
  });

  test('should throw error when transactions have different currencies', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      amount: 3000,
      currency: 'UAH',
      type: 'debit',
    });
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      amount: 4000,
      currency: 'USD',
      type: 'debit',
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(targetRecord);
    findRecordById.mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(
      'Cannot join transactions with different currencies: UAH and USD',
    );
  });

  test('should throw error when transactions have different types', async () => {
    const targetRecord = createMockTransactionRecord({
      id: 1,
      amount: 3000,
      currency: 'UAH',
      type: 'credit',
    });
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      amount: 4000,
      currency: 'UAH',
      type: 'debit',
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(targetRecord);
    findRecordById.mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({
        targetTransactionId: 1,
        sourceTransactionId: 2,
      }),
    ).rejects.toThrow(
      'Cannot join transactions with different types: credit and debit',
    );
  });
});
