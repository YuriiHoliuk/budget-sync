import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ConvertToTransferUseCase } from '@application/use-cases/ConvertToTransfer.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  AccountNotFoundError,
  CurrencyMismatchError,
  ManualTransactionNotAllowedError,
  TransactionAlreadyTransferError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { createTestAccount } from '../../helpers/fixtures.ts';

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

describe('ConvertToTransferUseCase', () => {
  let useCase: ConvertToTransferUseCase;
  let mockAccountRepository: AccountRepository;
  let mockTransactionRepository: TransactionRepository;

  beforeEach(() => {
    mockAccountRepository = {
      findByDbId: mock(() => Promise.resolve(null)),
      findByName: mock(() => Promise.resolve(null)),
      findById: mock(() => Promise.resolve(null)),
      findAll: mock(() => Promise.resolve([])),
      findActive: mock(() => Promise.resolve([])),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByIban: mock(() => Promise.resolve(null)),
      findByBank: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveAndReturn: mock((account) => Promise.resolve(account)),
      update: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
      updateLastSyncTime: mock(() => Promise.resolve()),
      updateBalance: mock(() => Promise.resolve()),
    } as unknown as AccountRepository;

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

    useCase = new ConvertToTransferUseCase(
      mockTransactionRepository,
      mockAccountRepository,
    );
  });

  test('should convert a DEBIT transaction to transfer', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const destinationAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    const result = await useCase.execute({
      transactionId: 1,
      destinationAccountId: 42,
    });

    expect(result.sourceTransactionId).toBe(1);
    expect(result.counterpartTransactionId).toBe(200);

    expect(mockTransactionRepository.updateRecordType).toHaveBeenCalledWith(
      1,
      'transfer',
    );

    expect(mockTransactionRepository.createTransferPair).toHaveBeenCalledWith(
      1,
      200,
    );

    expect(mockAccountRepository.updateBalance).toHaveBeenCalledTimes(1);
  });

  test('should convert a CREDIT transaction to transfer', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 5000,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const destinationAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    const result = await useCase.execute({
      transactionId: 2,
      destinationAccountId: 42,
    });

    expect(result.sourceTransactionId).toBe(2);

    // For CREDIT source, counterpart is outgoing, source is incoming
    expect(mockTransactionRepository.createTransferPair).toHaveBeenCalledWith(
      200,
      2,
    );
  });

  test('should throw TransactionNotFoundError if source not found', async () => {
    await expect(
      useCase.execute({ transactionId: 999, destinationAccountId: 42 }),
    ).rejects.toThrow(TransactionNotFoundError);
  });

  test('should throw TransactionAlreadyTransferError if already a transfer', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      type: 'transfer',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({ transactionId: 1, destinationAccountId: 42 }),
    ).rejects.toThrow(TransactionAlreadyTransferError);
  });

  test('should throw AccountNotFoundError if destination account not found', async () => {
    const sourceRecord = createMockTransactionRecord({ id: 1 });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    await expect(
      useCase.execute({ transactionId: 1, destinationAccountId: 999 }),
    ).rejects.toThrow(AccountNotFoundError);
  });

  test('should throw ManualTransactionNotAllowedError for synced destination', async () => {
    const sourceRecord = createMockTransactionRecord({ id: 1 });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const syncedAccount = createTestAccount({
      source: 'bank_sync',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(syncedAccount);

    await expect(
      useCase.execute({ transactionId: 1, destinationAccountId: 42 }),
    ).rejects.toThrow(ManualTransactionNotAllowedError);
  });

  test('should throw CurrencyMismatchError when currencies differ', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const usdAccount = createTestAccount({
      source: 'manual',
      currency: { code: 'USD' } as any,
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(usdAccount);

    await expect(
      useCase.execute({ transactionId: 1, destinationAccountId: 42 }),
    ).rejects.toThrow(CurrencyMismatchError);
  });

  test('should throw AccountNotFoundError for archived destination account', async () => {
    const sourceRecord = createMockTransactionRecord({ id: 1 });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const archivedAccount = createTestAccount({
      source: 'manual',
      isArchived: true,
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(archivedAccount);

    await expect(
      useCase.execute({ transactionId: 1, destinationAccountId: 42 }),
    ).rejects.toThrow(AccountNotFoundError);
  });

  test('should add amount to destination balance for DEBIT source', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const destinationAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
      balance: Money.create(100000, Currency.UAH),
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 1, destinationAccountId: 42 });

    const updateBalanceCalls = (
      mockAccountRepository.updateBalance as ReturnType<typeof mock>
    ).mock.calls;
    expect(updateBalanceCalls[0]?.[1].amount).toBe(105000);
  });

  test('should subtract amount from destination balance for CREDIT source', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 2,
      type: 'credit',
      amount: 5000,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const destinationAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
      balance: Money.create(100000, Currency.UAH),
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 2, destinationAccountId: 42 });

    const updateBalanceCalls2 = (
      mockAccountRepository.updateBalance as ReturnType<typeof mock>
    ).mock.calls;
    expect(updateBalanceCalls2[0]?.[1].amount).toBe(95000);
  });

  test('should create counterpart with transfer-counterpart- prefix', async () => {
    const sourceRecord = createMockTransactionRecord({
      id: 1,
      type: 'debit',
      amount: -5000,
      currency: 'UAH',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(sourceRecord);

    const destinationAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 1, destinationAccountId: 42 });

    const saveCalls = (
      mockTransactionRepository.saveAndReturn as ReturnType<typeof mock>
    ).mock.calls;
    const savedTransaction = saveCalls[0]?.[0] as Transaction;
    expect(savedTransaction.externalId).toMatch(/^transfer-counterpart-1-/);
  });
});
