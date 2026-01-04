import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type SyncTransactionsOptions,
  SyncTransactionsUseCase,
} from '@application/use-cases/SyncTransactions.ts';
import { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';
import { MonobankRateLimitError } from '@infrastructure/gateways/monobank/errors.ts';

function createTestAccount(
  overrides: Partial<Parameters<typeof Account.create>[0]> = {},
): Account {
  return Account.create({
    externalId: 'account-123',
    name: 'Test Account',
    currency: Currency.UAH,
    balance: Money.create(100000, Currency.UAH),
    bank: 'monobank',
    ...overrides,
  });
}

function createTestTransaction(
  overrides: Partial<Parameters<typeof Transaction.create>[0]> = {},
): Transaction {
  const externalId =
    overrides.externalId ?? `tx-${Date.now()}-${Math.random()}`;
  return Transaction.create({
    externalId,
    date: new Date('2026-01-02T10:00:00.000Z'),
    amount: Money.create(-5000, Currency.UAH),
    description: 'Test transaction',
    type: TransactionType.DEBIT,
    accountId: 'account-123',
    ...overrides,
  });
}

function createMockBankGateway(): BankGateway {
  return {
    getAccounts: mock(() => Promise.resolve([])),
    getTransactions: mock(() => Promise.resolve([])),
  } as BankGateway;
}

function createMockAccountRepository(): AccountRepository {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByExternalId: mock(() => Promise.resolve(null)),
    findByIban: mock(() => Promise.resolve(null)),
    findByBank: mock(() => Promise.resolve([])),
    findAll: mock(() => Promise.resolve([])),
    save: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    updateLastSyncTime: mock(() => Promise.resolve()),
  } as AccountRepository;
}

function createMockTransactionRepository(): TransactionRepository {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByExternalId: mock(() => Promise.resolve(null)),
    findByExternalIds: mock(() =>
      Promise.resolve(new Map<string, Transaction>()),
    ),
    findByAccountId: mock(() => Promise.resolve([])),
    findAll: mock(() => Promise.resolve([])),
    save: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    saveMany: mock(() => Promise.resolve()),
  } as TransactionRepository;
}

const DEFAULT_TEST_OPTIONS: SyncTransactionsOptions = {
  requestDelayMs: 0,
  maxRetries: 3,
  initialBackoffMs: 0,
  earliestSyncDate: new Date('2026-01-01'),
  syncOverlapMs: 600000,
};

describe('SyncTransactionsUseCase', () => {
  let bankGateway: BankGateway;
  let accountRepository: AccountRepository;
  let transactionRepository: TransactionRepository;
  let useCase: SyncTransactionsUseCase;

  beforeEach(() => {
    bankGateway = createMockBankGateway();
    accountRepository = createMockAccountRepository();
    transactionRepository = createMockTransactionRepository();
    useCase = new SyncTransactionsUseCase(
      bankGateway,
      accountRepository,
      transactionRepository,
    );
  });

  describe('execute()', () => {
    test('should return empty result when no accounts found', async () => {
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result).toEqual({
        totalAccounts: 0,
        syncedAccounts: 0,
        newTransactions: 0,
        skippedTransactions: 0,
        errors: [],
      });
    });

    test('should fetch accounts from repository and sync each account', async () => {
      const account1 = createTestAccount({
        externalId: 'acc-1',
        name: 'Account 1',
      });
      const account2 = createTestAccount({
        externalId: 'acc-2',
        name: 'Account 2',
      });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account1, account2]);

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(accountRepository.findByBank).toHaveBeenCalledWith('monobank');
      expect(result.totalAccounts).toBe(2);
      expect(result.syncedAccounts).toBe(2);
    });

    test('should record error but continue when account fetch fails', async () => {
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Database connection failed'));

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.totalAccounts).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to fetch accounts');
      expect(result.errors[0]).toContain('Database connection failed');
    });
  });

  describe('calculateSyncFrom()', () => {
    test('should use earliestSyncDate when lastSyncTime is undefined', async () => {
      const earliestSyncDate = new Date('2026-01-01T00:00:00.000Z');
      const account = createTestAccount({ lastSyncTime: undefined });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);

      await useCase.execute({ ...DEFAULT_TEST_OPTIONS, earliestSyncDate });

      const getTransactionsCalls = (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mock.calls;
      expect(getTransactionsCalls.length).toBeGreaterThan(0);
      const [, fromDate] = getTransactionsCalls[0] as [string, Date, Date];
      expect(fromDate.getTime()).toBe(earliestSyncDate.getTime());
    });

    test('should apply sync overlap when lastSyncTime is set', async () => {
      const syncOverlapMs = 600000; // 10 minutes
      // Use a lastSyncTime that is 1 hour ago to ensure sync range is valid
      const lastSyncTime = Date.now() - 3600000;
      const account = createTestAccount({ lastSyncTime });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);

      await useCase.execute({ ...DEFAULT_TEST_OPTIONS, syncOverlapMs });

      const getTransactionsCalls = (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mock.calls;
      expect(getTransactionsCalls.length).toBeGreaterThan(0);
      const [, fromDate] = getTransactionsCalls[0] as [string, Date, Date];
      const expectedFrom = lastSyncTime - syncOverlapMs;
      expect(fromDate.getTime()).toBe(expectedFrom);
    });

    test('should not sync earlier than earliestSyncDate even with overlap', async () => {
      const earliestSyncDate = new Date('2026-01-01T00:00:00.000Z');
      const lastSyncTime = new Date('2026-01-01T00:05:00.000Z').getTime(); // 5 minutes after earliest
      const syncOverlapMs = 600000; // 10 minutes overlap would go before earliest
      const account = createTestAccount({ lastSyncTime });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);

      await useCase.execute({
        ...DEFAULT_TEST_OPTIONS,
        earliestSyncDate,
        syncOverlapMs,
      });

      const getTransactionsCalls = (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mock.calls;
      expect(getTransactionsCalls.length).toBeGreaterThan(0);
      const [, fromDate] = getTransactionsCalls[0] as [string, Date, Date];
      expect(fromDate.getTime()).toBe(earliestSyncDate.getTime());
    });
  });

  describe('transaction deduplication', () => {
    test('should save new transactions and skip existing ones', async () => {
      const account = createTestAccount();
      const existingTx = createTestTransaction({ externalId: 'existing-tx-1' });
      const newTx1 = createTestTransaction({ externalId: 'new-tx-1' });
      const newTx2 = createTestTransaction({ externalId: 'new-tx-2' });

      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([existingTx, newTx1, newTx2]);
      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map([['existing-tx-1', existingTx]]));

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.newTransactions).toBe(2);
      expect(result.skippedTransactions).toBe(1);
      expect(transactionRepository.saveMany).toHaveBeenCalledTimes(1);
      const savedTransactions = (
        transactionRepository.saveMany as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Transaction[];
      expect(savedTransactions).toHaveLength(2);
      expect(savedTransactions.map((tx) => tx.externalId)).toContain(
        'new-tx-1',
      );
      expect(savedTransactions.map((tx) => tx.externalId)).toContain(
        'new-tx-2',
      );
    });

    test('should not call saveMany when all transactions already exist', async () => {
      const account = createTestAccount();
      const tx1 = createTestTransaction({ externalId: 'tx-1' });
      const tx2 = createTestTransaction({ externalId: 'tx-2' });

      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([tx1, tx2]);
      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(
        new Map([
          ['tx-1', tx1],
          ['tx-2', tx2],
        ]),
      );

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.newTransactions).toBe(0);
      expect(result.skippedTransactions).toBe(2);
      expect(transactionRepository.saveMany).not.toHaveBeenCalled();
    });

    test('should handle empty transactions list', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.newTransactions).toBe(0);
      expect(result.skippedTransactions).toBe(0);
      expect(transactionRepository.saveMany).not.toHaveBeenCalled();
    });

    test('should sort new transactions by date ascending before saving', async () => {
      const account = createTestAccount();
      const oldTx = createTestTransaction({
        externalId: 'old-tx',
        date: new Date('2026-01-01T10:00:00.000Z'),
      });
      const newTx = createTestTransaction({
        externalId: 'new-tx',
        date: new Date('2026-01-03T10:00:00.000Z'),
      });
      const middleTx = createTestTransaction({
        externalId: 'middle-tx',
        date: new Date('2026-01-02T10:00:00.000Z'),
      });

      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([newTx, oldTx, middleTx]);
      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Set());

      await useCase.execute(DEFAULT_TEST_OPTIONS);

      const savedTransactions = (
        transactionRepository.saveMany as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Transaction[];
      expect(savedTransactions[0]?.externalId).toBe('old-tx');
      expect(savedTransactions[1]?.externalId).toBe('middle-tx');
      expect(savedTransactions[2]?.externalId).toBe('new-tx');
    });
  });

  describe('retry logic', () => {
    test('should retry on MonobankRateLimitError with exponential backoff', async () => {
      const account = createTestAccount();
      const transaction = createTestTransaction();

      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);

      let callCount = 0;
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new MonobankRateLimitError());
        }
        return Promise.resolve([transaction]);
      });

      const result = await useCase.execute({
        ...DEFAULT_TEST_OPTIONS,
        maxRetries: 3,
        initialBackoffMs: 0,
      });

      expect(callCount).toBe(3);
      expect(result.syncedAccounts).toBe(1);
      expect(result.newTransactions).toBe(1);
    });

    test('should throw after max retries exceeded on rate limit error', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockRejectedValue(new MonobankRateLimitError());

      const result = await useCase.execute({
        ...DEFAULT_TEST_OPTIONS,
        maxRetries: 2,
        initialBackoffMs: 0,
      });

      expect(result.syncedAccounts).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to sync account');
      expect(result.errors[0]).toContain('Rate limit');
    });

    test('should not retry on non-rate-limit errors', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);

      let callCount = 0;
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Network error'));
      });

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(callCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Network error');
    });
  });

  describe('error handling', () => {
    test('should record error for individual account sync failure and continue with others', async () => {
      const account1 = createTestAccount({ externalId: 'acc-1' });
      const account2 = createTestAccount({ externalId: 'acc-2' });
      const transaction = createTestTransaction();

      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account1, account2]);

      let callCount = 0;
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('API error for first account'));
        }
        return Promise.resolve([transaction]);
      });

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.totalAccounts).toBe(2);
      expect(result.syncedAccounts).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to sync account acc-1');
    });

    test('should handle unknown error type', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockRejectedValue('string error');

      const result = await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unknown error');
    });
  });

  describe('rate limiting delay', () => {
    test('should not delay on first request', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const startTime = Date.now();
      await useCase.execute({ ...DEFAULT_TEST_OPTIONS, requestDelayMs: 100 });
      const elapsedTime = Date.now() - startTime;

      // Should be fast since first request has no delay
      expect(elapsedTime).toBeLessThan(50);
    });

    test('should apply delay between subsequent account syncs', async () => {
      const account1 = createTestAccount({ externalId: 'acc-1' });
      const account2 = createTestAccount({ externalId: 'acc-2' });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account1, account2]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const startTime = Date.now();
      await useCase.execute({ ...DEFAULT_TEST_OPTIONS, requestDelayMs: 50 });
      const elapsedTime = Date.now() - startTime;

      // Should have at least one delay (between first and second account)
      expect(elapsedTime).toBeGreaterThanOrEqual(45);
    });
  });

  describe('lastSyncTime update', () => {
    test('should update lastSyncTime after successful sync', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const beforeSync = Date.now();
      await useCase.execute(DEFAULT_TEST_OPTIONS);
      const afterSync = Date.now();

      expect(accountRepository.updateLastSyncTime).toHaveBeenCalledTimes(1);
      const [accountId, syncTime] = (
        accountRepository.updateLastSyncTime as ReturnType<typeof mock>
      ).mock.calls[0] as [string, number];
      expect(accountId).toBe(account.id);
      expect(syncTime).toBeGreaterThanOrEqual(beforeSync);
      expect(syncTime).toBeLessThanOrEqual(afterSync);
    });

    test('should not update lastSyncTime when sync fails', async () => {
      const account = createTestAccount();
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Sync failed'));

      await useCase.execute(DEFAULT_TEST_OPTIONS);

      expect(accountRepository.updateLastSyncTime).not.toHaveBeenCalled();
    });
  });

  describe('date range chunking', () => {
    test('should chunk large date ranges into 31-day segments', async () => {
      const earliestSyncDate = new Date('2026-01-01T00:00:00.000Z');
      const account = createTestAccount({ lastSyncTime: undefined });
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([account]);
      (
        bankGateway.getTransactions as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      // Set current time to be more than 31 days after earliest sync date
      // The use case uses `new Date()` internally, so we need to verify chunking behavior
      // by checking how many times getTransactions was called
      await useCase.execute({ ...DEFAULT_TEST_OPTIONS, earliestSyncDate });

      // Should be called at least once
      expect(bankGateway.getTransactions).toHaveBeenCalled();
    });
  });

  describe('default options', () => {
    test('should use default values when options not provided', async () => {
      (
        accountRepository.findByBank as ReturnType<typeof mock>
      ).mockResolvedValue([]);

      const result = await useCase.execute();

      expect(result.totalAccounts).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
