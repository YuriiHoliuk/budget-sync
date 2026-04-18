import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { RevertTransferUseCase } from '@application/use-cases/RevertTransfer.ts';
import {
  TransactionNotFoundError,
  TransferRevertNotAllowedError,
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
    type: 'transfer',
    accountId: 10,
    accountExternalId: 'acc-123',
    accountCurrency: 'UAH',
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

describe('RevertTransferUseCase', () => {
  let useCase: RevertTransferUseCase;
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
      saveAndReturn: mock(() => Promise.resolve(null)),
      saveMany: mock(() => Promise.resolve()),
      saveManyAndReturn: mock(() => Promise.resolve([])),
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

    useCase = new RevertTransferUseCase(
      mockTransactionRepository,
      mockAccountRepository,
    );
  });

  test('should revert a manually-converted transfer (outgoing side)', async () => {
    const pair = {
      outgoingTransactionId: 1,
      incomingTransactionId: 200,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    const counterpartRecord = createMockTransactionRecord({
      id: 200,
      externalId: 'transfer-counterpart-1-1234567890',
      accountId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(counterpartRecord);

    const destinationAccount = createTestAccount({
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 1 });

    expect(mockTransactionRepository.deleteTransferPair).toHaveBeenCalledWith(
      1,
      200,
    );

    expect(mockTransactionRepository.updateRecordType).toHaveBeenCalledWith(
      1,
      'debit',
    );

    expect(mockTransactionRepository.delete).toHaveBeenCalledWith(
      'transfer-counterpart-1-1234567890',
    );

    expect(mockAccountRepository.updateBalance).toHaveBeenCalledTimes(1);
  });

  test('should revert a manually-converted transfer (incoming side)', async () => {
    const pair = {
      outgoingTransactionId: 200,
      incomingTransactionId: 2,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    const counterpartRecord = createMockTransactionRecord({
      id: 200,
      externalId: 'transfer-counterpart-2-1234567890',
      accountId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(counterpartRecord);

    const destinationAccount = createTestAccount({
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 2 });

    expect(mockTransactionRepository.updateRecordType).toHaveBeenCalledWith(
      2,
      'credit',
    );
  });

  test('should throw TransactionNotFoundError if no transfer pair found', async () => {
    await expect(useCase.execute({ transactionId: 999 })).rejects.toThrow(
      TransactionNotFoundError,
    );
  });

  test('should throw TransferRevertNotAllowedError for auto-detected transfers', async () => {
    const pair = {
      outgoingTransactionId: 1,
      incomingTransactionId: 2,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    const autoDetectedCounterpart = createMockTransactionRecord({
      id: 2,
      externalId: 'mono-tx-456',
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(autoDetectedCounterpart);

    await expect(useCase.execute({ transactionId: 1 })).rejects.toThrow(
      TransferRevertNotAllowedError,
    );
  });

  test('should subtract balance for debit source revert', async () => {
    const pair = {
      outgoingTransactionId: 1,
      incomingTransactionId: 200,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    const counterpartRecord = createMockTransactionRecord({
      id: 200,
      externalId: 'transfer-counterpart-1-1234567890',
      amount: 5000,
      accountId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(counterpartRecord);

    const destinationAccount = createTestAccount({
      source: 'manual',
      dbId: 42,
      balance: Money.create(105000, Currency.UAH),
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 1 });

    const updateBalanceCalls = (
      mockAccountRepository.updateBalance as ReturnType<typeof mock>
    ).mock.calls;
    // Revert: was debit source → added to dest → now subtract
    expect(updateBalanceCalls[0]?.[1].amount).toBe(100000);
  });

  test('should add balance for credit source revert', async () => {
    const pair = {
      outgoingTransactionId: 200,
      incomingTransactionId: 2,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    const counterpartRecord = createMockTransactionRecord({
      id: 200,
      externalId: 'transfer-counterpart-2-1234567890',
      amount: 5000,
      accountId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(counterpartRecord);

    const destinationAccount = createTestAccount({
      source: 'manual',
      dbId: 42,
      balance: Money.create(95000, Currency.UAH),
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(destinationAccount);

    await useCase.execute({ transactionId: 2 });

    const updateBalanceCalls2 = (
      mockAccountRepository.updateBalance as ReturnType<typeof mock>
    ).mock.calls;
    // Revert: was credit source → subtracted from dest → now add
    expect(updateBalanceCalls2[0]?.[1].amount).toBe(100000);
  });

  test('should throw TransactionNotFoundError if counterpart not found', async () => {
    const pair = {
      outgoingTransactionId: 1,
      incomingTransactionId: 200,
    };
    (
      mockTransactionRepository.findTransferPairByTransactionId as ReturnType<
        typeof mock
      >
    ).mockResolvedValueOnce(pair);

    // findRecordById returns null for counterpart
    await expect(useCase.execute({ transactionId: 1 })).rejects.toThrow(
      TransactionNotFoundError,
    );
  });
});
