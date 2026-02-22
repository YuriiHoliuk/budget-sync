import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { MarkAsReturningUseCase } from '@application/use-cases/MarkAsReturning.ts';
import { BankTransaction } from '@domain/entities/BankTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  CurrencyMismatchError,
  OriginalTransactionNotDebitError,
  ReturningAccountMismatchError,
  ReturningAmountExceedsOriginalError,
  ReturningTransactionNotCreditError,
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
      date: overrides.date ?? new Date('2024-03-15'),
      amount: overrides.amount ?? Money.create(3000, Currency.UAH),
      currency: overrides.currency ?? Currency.UAH,
      type: overrides.type ?? TransactionType.CREDIT,
      bankDescription: overrides.bankDescription ?? 'Return payment',
    },
    overrides.id ?? 100,
  );
}

describe('MarkAsReturningUseCase', () => {
  let useCase: MarkAsReturningUseCase;
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

    useCase = new MarkAsReturningUseCase(
      mockTransactionRepository,
      mockBankTransactionRepository,
    );
  });

  test('should process partial return: reduce original amount, link bank_txs, delete returning', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-returning',
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-original',
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    const originalDebitBankTx = createMockBankTransaction({
      id: 50,
      externalId: 'bank-debit-original',
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });

    const bankTx1 = createMockBankTransaction({
      id: 100,
      externalId: 'bank-tx-1',
    });
    const bankTx2 = createMockBankTransaction({
      id: 101,
      externalId: 'bank-tx-2',
    });

    const findByTransactionId =
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >;
    // First call: recordBankTransactionReturns fetches original bank txs
    findByTransactionId.mockResolvedValueOnce([originalDebitBankTx]);
    // Second call: recordBankTransactionReturns fetches returning bank txs
    findByTransactionId.mockResolvedValueOnce([bankTx1, bankTx2]);
    // Third call: processPartialReturn fetches returning bank txs for re-linking
    findByTransactionId.mockResolvedValueOnce([bankTx1, bankTx2]);

    const result = await useCase.execute({
      returningTransactionId: 2,
      originalTransactionId: 1,
    });

    expect(result.type).toBe('partial');
    expect(result.originalTransactionId).toBe(1);
    expect(result.returningAmount).toBe(3000);
    expect(result.originalAmount).toBe(5000);
    expect(result.newOriginalAmount).toBe(2000);

    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(1, 2000);

    expect(mockBankTransactionRepository.saveReturn).toHaveBeenCalledTimes(2);
    expect(mockBankTransactionRepository.saveReturn).toHaveBeenCalledWith({
      originalBankTransactionId: 50,
      returningBankTransactionId: 100,
      amount: 3000,
    });
    expect(mockBankTransactionRepository.saveReturn).toHaveBeenCalledWith({
      originalBankTransactionId: 50,
      returningBankTransactionId: 101,
      amount: 3000,
    });

    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledTimes(2);
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(1, 100);
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(1, 101);

    expect(mockTransactionRepository.delete).toHaveBeenCalledWith(
      'tx-returning',
    );
  });

  test('should process full return: delete both transactions when amounts are equal', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-returning',
      type: 'credit',
      amount: 5000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-original',
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    const originalDebitBankTx = createMockBankTransaction({
      id: 50,
      externalId: 'bank-debit-original',
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });

    const returningBankTx = createMockBankTransaction({
      id: 100,
      externalId: 'bank-returning',
      amount: Money.create(5000, Currency.UAH),
    });

    const findByTransactionId =
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >;
    // recordBankTransactionReturns: original bank txs, then returning bank txs
    findByTransactionId.mockResolvedValueOnce([originalDebitBankTx]);
    findByTransactionId.mockResolvedValueOnce([returningBankTx]);

    const result = await useCase.execute({
      returningTransactionId: 2,
      originalTransactionId: 1,
    });

    expect(result.type).toBe('full');
    expect(result.originalTransactionId).toBe(1);
    expect(result.returningAmount).toBe(5000);
    expect(result.originalAmount).toBe(5000);
    expect(result.newOriginalAmount).toBeNull();

    expect(mockBankTransactionRepository.saveReturn).toHaveBeenCalledWith({
      originalBankTransactionId: 50,
      returningBankTransactionId: 100,
      amount: 5000,
    });

    const deleteCalls = (
      mockTransactionRepository.delete as ReturnType<typeof mock>
    ).mock.calls;
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0]?.[0]).toBe('tx-returning');
    expect(deleteCalls[1]?.[0]).toBe('tx-original');

    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).not.toHaveBeenCalled();
  });

  test('should throw TransactionNotFoundError when returning transaction not found', async () => {
    await expect(
      useCase.execute({
        returningTransactionId: 999,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw TransactionNotFoundError when original transaction not found', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(returningRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 999,
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw ReturningTransactionNotCreditError when returning is not credit', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'debit',
      amount: -3000,
      currency: 'UAH',
      accountId: 10,
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(returningRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(ReturningTransactionNotCreditError);
  });

  test('should throw OriginalTransactionNotDebitError when original is not debit', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      type: 'credit',
      amount: 5000,
      currency: 'UAH',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(OriginalTransactionNotDebitError);
  });

  test('should throw TransactionIsTransferError when returning is a transfer', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'transfer',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });

    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(returningRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(TransactionIsTransferError);
  });

  test('should throw TransactionIsTransferError when original is a transfer', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      type: 'transfer',
      amount: -5000,
      currency: 'UAH',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(TransactionIsTransferError);
  });

  test('should throw CurrencyMismatchError when currencies differ', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'USD',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(CurrencyMismatchError);
  });

  test('should throw ReturningAccountMismatchError when accounts differ', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
      accountId: 20,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(ReturningAccountMismatchError);
  });

  test('should throw ReturningAmountExceedsOriginalError when returning exceeds original', async () => {
    const returningRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 8000,
      currency: 'UAH',
      accountId: 10,
    });
    const originalRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
      accountId: 10,
    });

    const findRecordById =
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>;
    findRecordById.mockResolvedValueOnce(returningRecord);
    findRecordById.mockResolvedValueOnce(originalRecord);

    await expect(
      useCase.execute({
        returningTransactionId: 2,
        originalTransactionId: 1,
      }),
    ).rejects.toThrow(ReturningAmountExceedsOriginalError);
  });
});
