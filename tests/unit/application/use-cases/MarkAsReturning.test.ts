import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  AnchorAmountInsufficientError,
  MarkAsReturningUseCase,
  MultiOnBothSidesUnsupportedError,
} from '@application/use-cases/MarkAsReturning.ts';
import { BankTransaction } from '@domain/entities/BankTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  CurrencyMismatchError,
  OriginalTransactionNotDebitError,
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

function createRepositoryMocks() {
  const mockTransactionRepository = {
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

  const mockBankTransactionRepository = {
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

  return { mockTransactionRepository, mockBankTransactionRepository };
}

function mockFindRecordByIdLookup(
  mockTransactionRepository: TransactionRepository,
  records: TransactionRecord[],
) {
  const findRecordById = mockTransactionRepository.findRecordById as ReturnType<
    typeof mock
  >;
  findRecordById.mockImplementation((id: number) => {
    const record = records.find((r) => r.id === id);
    return Promise.resolve(record ?? null);
  });
}

function mockBankTxsByTransactionId(
  mockBankTransactionRepository: BankTransactionRepository,
  map: Map<number, BankTransaction[]>,
) {
  const findByTransactionId =
    mockBankTransactionRepository.findByTransactionId as ReturnType<
      typeof mock
    >;
  findByTransactionId.mockImplementation((id: number) =>
    Promise.resolve(map.get(id) ?? []),
  );
}

describe('MarkAsReturningUseCase — single-pair', () => {
  let useCase: MarkAsReturningUseCase;
  let mockTransactionRepository: TransactionRepository;
  let mockBankTransactionRepository: BankTransactionRepository;

  beforeEach(() => {
    const mocks = createRepositoryMocks();
    mockTransactionRepository = mocks.mockTransactionRepository;
    mockBankTransactionRepository = mocks.mockBankTransactionRepository;

    useCase = new MarkAsReturningUseCase(
      mockTransactionRepository,
      mockBankTransactionRepository,
    );
  });

  test('debit_reduced: reduces debit amount, re-links credit bank_txs, deletes credit tx', async () => {
    const creditRecord = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-credit',
      type: 'credit',
      amount: 3000,
    });
    const debitRecord = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-debit',
      type: 'debit',
      amount: -5000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      creditRecord,
      debitRecord,
    ]);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });
    const creditBankTx1 = createMockBankTransaction({
      id: 100,
    });
    const creditBankTx2 = createMockBankTransaction({
      id: 101,
    });

    mockBankTxsByTransactionId(
      mockBankTransactionRepository,
      new Map<number, BankTransaction[]>([
        [debitRecord.id, [debitBankTx]],
        [creditRecord.id, [creditBankTx1, creditBankTx2]],
      ]),
    );

    const result = await useCase.execute({
      creditTransactionIds: [creditRecord.id],
      debitTransactionIds: [debitRecord.id],
    });

    expect(result.type).toBe('debit_reduced');
    expect(result.survivingTransactionId).toBe(debitRecord.id);
    expect(result.newSurvivingAmount).toBe(2000);
    expect(result.totalDebitAmount).toBe(5000);
    expect(result.totalCreditAmount).toBe(3000);
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(debitRecord.id, 2000);
    expect(mockBankTransactionRepository.saveReturn).toHaveBeenCalledTimes(2);
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-credit');
  });

  test('full_cancel: deletes both transactions when amounts are equal', async () => {
    const creditRecord = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-credit',
      type: 'credit',
      amount: 5000,
    });
    const debitRecord = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-debit',
      type: 'debit',
      amount: -5000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      creditRecord,
      debitRecord,
    ]);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });
    const creditBankTx = createMockBankTransaction({
      id: 100,
      amount: Money.create(5000, Currency.UAH),
    });

    mockBankTxsByTransactionId(
      mockBankTransactionRepository,
      new Map<number, BankTransaction[]>([
        [debitRecord.id, [debitBankTx]],
        [creditRecord.id, [creditBankTx]],
      ]),
    );

    const result = await useCase.execute({
      creditTransactionIds: [creditRecord.id],
      debitTransactionIds: [debitRecord.id],
    });

    expect(result.type).toBe('full_cancel');
    expect(result.survivingTransactionId).toBeNull();
    expect(result.newSurvivingAmount).toBeNull();
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).not.toHaveBeenCalled();
    const deleteCalls = (
      mockTransactionRepository.delete as ReturnType<typeof mock>
    ).mock.calls;
    expect(deleteCalls).toHaveLength(2);
  });

  test('credit_reduced: reduces credit amount, re-links debit bank_txs, deletes debit tx', async () => {
    const creditRecord = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-credit',
      type: 'credit',
      amount: 8000,
    });
    const debitRecord = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-debit',
      type: 'debit',
      amount: -5000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      creditRecord,
      debitRecord,
    ]);

    const debitBankTx = createMockBankTransaction({
      id: 50,
      type: TransactionType.DEBIT,
      amount: Money.create(-5000, Currency.UAH),
    });
    const creditBankTx = createMockBankTransaction({
      id: 100,
      amount: Money.create(8000, Currency.UAH),
    });

    mockBankTxsByTransactionId(
      mockBankTransactionRepository,
      new Map<number, BankTransaction[]>([
        [debitRecord.id, [debitBankTx]],
        [creditRecord.id, [creditBankTx]],
      ]),
    );

    const result = await useCase.execute({
      creditTransactionIds: [creditRecord.id],
      debitTransactionIds: [debitRecord.id],
    });

    expect(result.type).toBe('credit_reduced');
    expect(result.survivingTransactionId).toBe(creditRecord.id);
    expect(result.newSurvivingAmount).toBe(3000);
    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(creditRecord.id, 3000);
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(creditRecord.id, debitBankTx.id);
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-debit');
  });

  test('throws TransactionNotFoundError when credit transaction not found', async () => {
    await expect(
      useCase.execute({
        creditTransactionIds: [999],
        debitTransactionIds: [1],
      }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('throws ReturningTransactionNotCreditError when credit arg is not credit', async () => {
    const notCredit = createMockTransactionRecord({
      id: 2,
      type: 'debit',
      amount: -3000,
    });
    mockFindRecordByIdLookup(mockTransactionRepository, [notCredit]);

    await expect(
      useCase.execute({
        creditTransactionIds: [notCredit.id],
        debitTransactionIds: [1],
      }),
    ).rejects.toThrow(ReturningTransactionNotCreditError);
  });

  test('throws OriginalTransactionNotDebitError when debit arg is not debit', async () => {
    const creditRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
    });
    const notDebit = createMockTransactionRecord({
      id: 1,
      type: 'credit',
      amount: 5000,
    });
    mockFindRecordByIdLookup(mockTransactionRepository, [
      creditRecord,
      notDebit,
    ]);

    await expect(
      useCase.execute({
        creditTransactionIds: [creditRecord.id],
        debitTransactionIds: [notDebit.id],
      }),
    ).rejects.toThrow(OriginalTransactionNotDebitError);
  });

  test('throws TransactionIsTransferError when credit arg is a transfer', async () => {
    const transfer = createMockTransactionRecord({
      id: 2,
      type: 'transfer',
      amount: 3000,
    });
    mockFindRecordByIdLookup(mockTransactionRepository, [transfer]);

    await expect(
      useCase.execute({
        creditTransactionIds: [transfer.id],
        debitTransactionIds: [1],
      }),
    ).rejects.toThrow(TransactionIsTransferError);
  });

  test('throws CurrencyMismatchError when currencies differ', async () => {
    const credit = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 3000,
      currency: 'UAH',
    });
    const debit = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'USD',
    });
    mockFindRecordByIdLookup(mockTransactionRepository, [credit, debit]);

    await expect(
      useCase.execute({
        creditTransactionIds: [credit.id],
        debitTransactionIds: [debit.id],
      }),
    ).rejects.toThrow(CurrencyMismatchError);
  });
});

describe('MarkAsReturningUseCase — multi-select', () => {
  let useCase: MarkAsReturningUseCase;
  let mockTransactionRepository: TransactionRepository;
  let mockBankTransactionRepository: BankTransactionRepository;

  beforeEach(() => {
    const mocks = createRepositoryMocks();
    mockTransactionRepository = mocks.mockTransactionRepository;
    mockBankTransactionRepository = mocks.mockBankTransactionRepository;

    useCase = new MarkAsReturningUseCase(
      mockTransactionRepository,
      mockBankTransactionRepository,
    );
  });

  test('credit-anchor: salary absorbs many expenses → credit_reduced by sum', async () => {
    // Salary 100000; three expenses totaling 40000. Salary survives with 60000.
    const salary = createMockTransactionRecord({
      id: 10,
      externalId: 'tx-salary',
      type: 'credit',
      amount: 100000,
    });
    const expense1 = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-exp-1',
      type: 'debit',
      amount: -15000,
    });
    const expense2 = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-exp-2',
      type: 'debit',
      amount: -10000,
    });
    const expense3 = createMockTransactionRecord({
      id: 3,
      externalId: 'tx-exp-3',
      type: 'debit',
      amount: -15000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      salary,
      expense1,
      expense2,
      expense3,
    ]);

    const salaryBankTx = createMockBankTransaction({
      id: 500,
      type: TransactionType.CREDIT,
      amount: Money.create(100000, Currency.UAH),
    });
    const expense1BankTx = createMockBankTransaction({
      id: 100,
      type: TransactionType.DEBIT,
      amount: Money.create(-15000, Currency.UAH),
    });
    const expense2BankTx = createMockBankTransaction({
      id: 200,
      type: TransactionType.DEBIT,
      amount: Money.create(-10000, Currency.UAH),
    });
    const expense3BankTx = createMockBankTransaction({
      id: 300,
      type: TransactionType.DEBIT,
      amount: Money.create(-15000, Currency.UAH),
    });

    mockBankTxsByTransactionId(
      mockBankTransactionRepository,
      new Map<number, BankTransaction[]>([
        [salary.id, [salaryBankTx]],
        [expense1.id, [expense1BankTx]],
        [expense2.id, [expense2BankTx]],
        [expense3.id, [expense3BankTx]],
      ]),
    );

    const result = await useCase.execute({
      creditTransactionIds: [salary.id],
      debitTransactionIds: [expense1.id, expense2.id, expense3.id],
    });

    expect(result.type).toBe('credit_reduced');
    expect(result.survivingTransactionId).toBe(salary.id);
    expect(result.newSurvivingAmount).toBe(60000);
    expect(result.totalDebitAmount).toBe(40000);
    expect(result.totalCreditAmount).toBe(100000);

    expect(
      mockTransactionRepository.updateTransactionAmount,
    ).toHaveBeenCalledWith(salary.id, 60000);

    // Each expense's bank_tx should be re-linked to the salary
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(salary.id, expense1BankTx.id);
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(salary.id, expense2BankTx.id);
    expect(
      mockBankTransactionRepository.linkTransactionSource,
    ).toHaveBeenCalledWith(salary.id, expense3BankTx.id);

    // All three expense transactions should be deleted
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-exp-1');
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-exp-2');
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-exp-3');
  });

  test('debit-anchor: one pub expense absorbs multiple friend refunds → debit_reduced by sum', async () => {
    // Pub 120000; three friend refunds totaling 60000. Pub survives with 60000.
    const pub = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-pub',
      type: 'debit',
      amount: -120000,
    });
    const friend1 = createMockTransactionRecord({
      id: 11,
      externalId: 'tx-f1',
      type: 'credit',
      amount: 20000,
    });
    const friend2 = createMockTransactionRecord({
      id: 12,
      externalId: 'tx-f2',
      type: 'credit',
      amount: 20000,
    });
    const friend3 = createMockTransactionRecord({
      id: 13,
      externalId: 'tx-f3',
      type: 'credit',
      amount: 20000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      pub,
      friend1,
      friend2,
      friend3,
    ]);

    const pubBankTx = createMockBankTransaction({
      id: 10,
      type: TransactionType.DEBIT,
      amount: Money.create(-120000, Currency.UAH),
    });
    const friend1BankTx = createMockBankTransaction({
      id: 21,
      amount: Money.create(20000, Currency.UAH),
    });
    const friend2BankTx = createMockBankTransaction({
      id: 22,
      amount: Money.create(20000, Currency.UAH),
    });
    const friend3BankTx = createMockBankTransaction({
      id: 23,
      amount: Money.create(20000, Currency.UAH),
    });

    mockBankTxsByTransactionId(
      mockBankTransactionRepository,
      new Map<number, BankTransaction[]>([
        [pub.id, [pubBankTx]],
        [friend1.id, [friend1BankTx]],
        [friend2.id, [friend2BankTx]],
        [friend3.id, [friend3BankTx]],
      ]),
    );

    const result = await useCase.execute({
      creditTransactionIds: [friend1.id, friend2.id, friend3.id],
      debitTransactionIds: [pub.id],
    });

    expect(result.type).toBe('debit_reduced');
    expect(result.survivingTransactionId).toBe(pub.id);
    expect(result.newSurvivingAmount).toBe(60000);
    expect(result.totalDebitAmount).toBe(120000);
    expect(result.totalCreditAmount).toBe(60000);

    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-f1');
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-f2');
    expect(mockTransactionRepository.delete).toHaveBeenCalledWith('tx-f3');
  });

  test('full_cancel with multi: sums equal', async () => {
    const salary = createMockTransactionRecord({
      id: 10,
      externalId: 'tx-salary',
      type: 'credit',
      amount: 30000,
    });
    const expense1 = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-exp-1',
      type: 'debit',
      amount: -20000,
    });
    const expense2 = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-exp-2',
      type: 'debit',
      amount: -10000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      salary,
      expense1,
      expense2,
    ]);

    const findByTransactionId =
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >;
    findByTransactionId.mockResolvedValue([]);

    const result = await useCase.execute({
      creditTransactionIds: [salary.id],
      debitTransactionIds: [expense1.id, expense2.id],
    });

    expect(result.type).toBe('full_cancel');
    expect(result.survivingTransactionId).toBeNull();
    expect(result.totalDebitAmount).toBe(30000);
    expect(result.totalCreditAmount).toBe(30000);

    // All three transactions should be deleted
    const deleteCalls = (
      mockTransactionRepository.delete as ReturnType<typeof mock>
    ).mock.calls;
    expect(deleteCalls).toHaveLength(3);
  });

  test('rejects when many-side sum exceeds anchor amount', async () => {
    // Salary 10000; expenses totaling 30000. Anchor cannot absorb.
    const salary = createMockTransactionRecord({
      id: 10,
      type: 'credit',
      amount: 10000,
    });
    const expense1 = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -20000,
    });
    const expense2 = createMockTransactionRecord({
      id: 2,
      type: 'debit',
      amount: -10000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      salary,
      expense1,
      expense2,
    ]);

    await expect(
      useCase.execute({
        creditTransactionIds: [salary.id],
        debitTransactionIds: [expense1.id, expense2.id],
      }),
    ).rejects.toThrow(AnchorAmountInsufficientError);
  });

  test('rejects multi-on-both-sides', async () => {
    const credit1 = createMockTransactionRecord({
      id: 10,
      type: 'credit',
      amount: 5000,
    });
    const credit2 = createMockTransactionRecord({
      id: 11,
      type: 'credit',
      amount: 5000,
    });
    const debit1 = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
    });
    const debit2 = createMockTransactionRecord({
      id: 2,
      type: 'debit',
      amount: -5000,
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      credit1,
      credit2,
      debit1,
      debit2,
    ]);

    await expect(
      useCase.execute({
        creditTransactionIds: [credit1.id, credit2.id],
        debitTransactionIds: [debit1.id, debit2.id],
      }),
    ).rejects.toThrow(MultiOnBothSidesUnsupportedError);
  });

  test('cross-account multi: expenses on account A absorbed into salary on account B', async () => {
    const salaryOnB = createMockTransactionRecord({
      id: 10,
      externalId: 'tx-salary-b',
      type: 'credit',
      amount: 100000,
      accountId: 20,
      accountExternalId: 'acc-b',
    });
    const expenseOnA1 = createMockTransactionRecord({
      id: 1,
      externalId: 'tx-a-1',
      type: 'debit',
      amount: -15000,
      accountId: 10,
      accountExternalId: 'acc-a',
    });
    const expenseOnA2 = createMockTransactionRecord({
      id: 2,
      externalId: 'tx-a-2',
      type: 'debit',
      amount: -5000,
      accountId: 10,
      accountExternalId: 'acc-a',
    });

    mockFindRecordByIdLookup(mockTransactionRepository, [
      salaryOnB,
      expenseOnA1,
      expenseOnA2,
    ]);

    const findByTransactionId =
      mockBankTransactionRepository.findByTransactionId as ReturnType<
        typeof mock
      >;
    findByTransactionId.mockResolvedValue([]);

    const result = await useCase.execute({
      creditTransactionIds: [salaryOnB.id],
      debitTransactionIds: [expenseOnA1.id, expenseOnA2.id],
    });

    expect(result.type).toBe('credit_reduced');
    expect(result.survivingTransactionId).toBe(salaryOnB.id);
    expect(result.newSurvivingAmount).toBe(80000);
  });
});
