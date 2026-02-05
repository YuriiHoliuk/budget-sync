import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CreateTransactionUseCase } from '@application/use-cases/CreateTransaction.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import {
  AccountNotFoundError,
  ManualTransactionNotAllowedError,
} from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { TransactionType } from '@domain/value-objects/index.ts';
import { createTestAccount } from '../../helpers/fixtures.ts';

describe('CreateTransactionUseCase', () => {
  let useCase: CreateTransactionUseCase;
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
      findByExternalId: mock(() => Promise.resolve(null)),
      findByExternalIds: mock(() => Promise.resolve(new Map())),
      findByAccountId: mock(() => Promise.resolve([])),
      findAll: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveMany: mock(() => Promise.resolve()),
      saveManyAndReturn: mock((transactions: Transaction[]) =>
        Promise.resolve(
          transactions.map((txn: Transaction, idx: number) =>
            txn.withDbId(100 + idx),
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
      findTransactionSummaries: mock(() => Promise.resolve([])),
    } as unknown as TransactionRepository;

    useCase = new CreateTransactionUseCase(
      mockTransactionRepository,
      mockAccountRepository,
    );
  });

  test('should create transaction on a manual account', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(manualAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 100.5,
      type: 'DEBIT' as const,
      description: 'Grocery shopping',
    };

    const result = await useCase.execute(request);

    expect(result.description).toBe('Grocery shopping');
    expect(result.type).toBe(TransactionType.DEBIT);
    expect(result.amount.amount).toBe(10050); // 100.50 in minor units
    expect(result.accountId).toBe(manualAccount.externalId);
    expect(result.externalId).toMatch(/^manual-txn-/);
    expect(result.dbId).toBe(100);
    expect(mockTransactionRepository.saveManyAndReturn).toHaveBeenCalledTimes(
      1,
    );
  });

  test('should create CREDIT transaction', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(manualAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 500,
      type: 'CREDIT' as const,
      description: 'Salary',
    };

    const result = await useCase.execute(request);

    expect(result.type).toBe(TransactionType.CREDIT);
    expect(result.amount.amount).toBe(50000);
  });

  test('should create transaction with optional fields', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(manualAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 250,
      type: 'DEBIT' as const,
      description: 'Restaurant dinner',
      counterpartyName: 'Pizzeria Roma',
      counterpartyIban: 'UA1234567890123456789012345',
      mcc: 5812,
      notes: 'Business dinner with client',
    };

    const result = await useCase.execute(request);

    expect(result.counterpartyName).toBe('Pizzeria Roma');
    expect(result.counterpartyIban).toBe('UA1234567890123456789012345');
    expect(result.mcc).toBe(5812);
    expect(result.comment).toBe('Business dinner with client');
  });

  test('should throw AccountNotFoundError if account does not exist', async () => {
    const request = {
      accountId: 999,
      date: '2024-03-15',
      amount: 100,
      type: 'DEBIT' as const,
      description: 'Test transaction',
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      AccountNotFoundError,
    );
    expect(mockTransactionRepository.saveManyAndReturn).not.toHaveBeenCalled();
  });

  test('should throw ManualTransactionNotAllowedError for synced account', async () => {
    const syncedAccount = createTestAccount({
      name: 'Monobank Card',
      source: 'bank_sync',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(syncedAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 100,
      type: 'DEBIT' as const,
      description: 'Test transaction',
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      ManualTransactionNotAllowedError,
    );
    expect(mockTransactionRepository.saveManyAndReturn).not.toHaveBeenCalled();
  });

  test('should use account currency for transaction', async () => {
    const usdAccount = createTestAccount({
      name: 'USD Cash',
      source: 'manual',
      currency: { code: 'USD' } as any,
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(usdAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 50.99,
      type: 'DEBIT' as const,
      description: 'Coffee',
    };

    const result = await useCase.execute(request);

    expect(result.amount.currency.code).toBe('USD');
    expect(result.amount.amount).toBe(5099);
  });

  test('should generate unique external IDs for each transaction', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValue(manualAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 100,
      type: 'DEBIT' as const,
      description: 'Test',
    };

    const result1 = await useCase.execute(request);
    const result2 = await useCase.execute(request);

    expect(result1.externalId).not.toBe(result2.externalId);
    expect(result1.externalId).toMatch(/^manual-txn-/);
    expect(result2.externalId).toMatch(/^manual-txn-/);
  });

  test('should handle null optional fields', async () => {
    const manualAccount = createTestAccount({
      name: 'Cash',
      source: 'manual',
      dbId: 42,
    });
    (
      mockAccountRepository.findByDbId as ReturnType<typeof mock>
    ).mockResolvedValueOnce(manualAccount);

    const request = {
      accountId: 42,
      date: '2024-03-15',
      amount: 100,
      type: 'DEBIT' as const,
      description: 'Test',
      counterpartyName: null,
      counterpartyIban: null,
      mcc: null,
      notes: null,
    };

    const result = await useCase.execute(request);

    expect(result.counterpartyName).toBeUndefined();
    expect(result.counterpartyIban).toBeUndefined();
    expect(result.mcc).toBeUndefined();
    expect(result.comment).toBeUndefined();
  });
});
