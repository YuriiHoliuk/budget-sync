import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { DeleteTransactionUseCase } from '@application/use-cases/DeleteTransaction.ts';
import {
  ManualTransactionNotAllowedError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { createTestAccount } from '../../helpers/fixtures.ts';

function makeRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: 1,
    externalId: 'manual-txn-1',
    date: new Date(),
    amount: 5000,
    currency: 'UAH',
    type: 'debit',
    accountId: 42,
    accountExternalId: 'acc-123',
    accountCurrency: 'UAH',
    categoryId: null,
    budgetId: null,
    categorizationStatus: null,
    categoryReason: null,
    budgetReason: null,
    mcc: null,
    bankDescription: null,
    counterparty: null,
    counterpartyIban: null,
    hold: null,
    cashback: null,
    commission: null,
    receiptId: null,
    notes: null,
    bankTransactionCount: 0,
    ...overrides,
  };
}

describe('DeleteTransactionUseCase', () => {
  let useCase: DeleteTransactionUseCase;
  let mockAccountRepository: AccountRepository;
  let mockTransactionRepository: TransactionRepository;

  beforeEach(() => {
    mockAccountRepository = {
      findByDbId: mock(() => Promise.resolve(null)),
    } as unknown as AccountRepository;

    mockTransactionRepository = {
      findRecordById: mock(() => Promise.resolve(null)),
      deleteByDbId: mock(() => Promise.resolve()),
    } as unknown as TransactionRepository;

    useCase = new DeleteTransactionUseCase(
      mockTransactionRepository,
      mockAccountRepository,
    );
  });

  test('deletes a transaction on a manual account', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(makeRecord({ id: 1, accountId: 42 }));
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(manualAccount);

    const result = await useCase.execute({ id: 1 });

    expect(result).toBe(true);
    expect(mockTransactionRepository.deleteByDbId).toHaveBeenCalledWith(1);
  });

  test('throws TransactionNotFoundError if transaction does not exist', async () => {
    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      TransactionNotFoundError,
    );
    expect(mockTransactionRepository.deleteByDbId).not.toHaveBeenCalled();
  });

  test('throws ManualTransactionNotAllowedError on synced account', async () => {
    const syncedAccount = createTestAccount({
      name: 'Monobank Card',
      source: 'bank_sync',
      dbId: 42,
    });
    (
      mockTransactionRepository.findRecordById as ReturnType<typeof mock>
    ).mockResolvedValueOnce(makeRecord({ id: 1, accountId: 42 }));
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(syncedAccount);

    await expect(useCase.execute({ id: 1 })).rejects.toThrow(
      ManualTransactionNotAllowedError,
    );
    expect(mockTransactionRepository.deleteByDbId).not.toHaveBeenCalled();
  });
});
