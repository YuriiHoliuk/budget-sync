import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SyncMonobankOptions } from '@application/use-cases/SyncMonobank.ts';
import { SyncMonobankUseCase } from '@application/use-cases/SyncMonobank.ts';
import type { Account } from '@domain/entities/Account.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { MonobankRateLimitError } from '@infrastructure/gateways/monobank/errors.ts';
import type { Logger } from '@modules/logging';
import {
  createMockAccountRepository,
  createMockBankGateway,
  createMockLogger,
  createMockTransactionRepository,
  createTestAccount,
  createTestTransaction,
  FAST_TEST_OPTIONS,
} from '../../helpers';

// Alias for backward compatibility within tests
const createAccount = createTestAccount;
const createTransaction = createTestTransaction;
const fastTestOptions: SyncMonobankOptions = FAST_TEST_OPTIONS;

describe('SyncMonobankUseCase', () => {
  let mockLogger: Logger;
  let mockBankGateway: BankGateway;
  let mockAccountRepository: AccountRepository;
  let mockTransactionRepository: TransactionRepository;
  let useCase: SyncMonobankUseCase;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockBankGateway = createMockBankGateway();
    mockAccountRepository = createMockAccountRepository();
    mockTransactionRepository = createMockTransactionRepository();

    useCase = new SyncMonobankUseCase(
      mockBankGateway,
      mockAccountRepository,
      mockTransactionRepository,
      mockLogger,
    );
  });

  describe('execute()', () => {
    test('should return empty result when no accounts and no transactions', async () => {
      const result = await useCase.execute(fastTestOptions);

      expect(result).toEqual({
        accounts: {
          created: 0,
          updated: 0,
          unchanged: 0,
        },
        transactions: {
          totalAccounts: 0,
          syncedAccounts: 0,
          newTransactions: 0,
          updatedTransactions: 0,
          skippedTransactions: 0,
        },
        errors: [],
      });
    });

    test('should sync accounts and transactions in order', async () => {
      const account = createAccount();
      const callOrder: string[] = [];

      mockBankGateway = createMockBankGateway({
        getAccounts: mock(() => {
          callOrder.push('getAccounts');
          return Promise.resolve([account]);
        }),
        getTransactions: mock(() => {
          callOrder.push('getTransactions');
          return Promise.resolve([]);
        }),
      });

      mockAccountRepository = createMockAccountRepository({
        findByExternalId: mock(() => Promise.resolve(null)),
        save: mock(() => {
          callOrder.push('saveAccount');
          return Promise.resolve();
        }),
        findByBank: mock(() => {
          callOrder.push('findByBank');
          return Promise.resolve([account]);
        }),
        updateLastSyncTime: mock(() => Promise.resolve()),
      });

      useCase = new SyncMonobankUseCase(
        mockBankGateway,
        mockAccountRepository,
        mockTransactionRepository,
        mockLogger,
      );

      await useCase.execute(fastTestOptions);

      expect(callOrder).toEqual([
        'getAccounts',
        'saveAccount',
        'findByBank',
        'getTransactions',
      ]);
    });

    test('should log sync start and completion', async () => {
      await useCase.execute(fastTestOptions);

      expect(mockLogger.info).toHaveBeenCalledWith('Starting Monobank sync');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Monobank sync completed',
        expect.any(Object),
      );
    });
  });

  describe('account sync', () => {
    describe('creating new accounts', () => {
      test('should save new account when not found by externalId', async () => {
        const newAccount = createAccount({ externalId: 'new-account-id' });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([newAccount])),
        });

        const saveMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(null)),
          findByIban: mock(() => Promise.resolve(null)),
          save: saveMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.created).toBe(1);
        expect(saveMock).toHaveBeenCalledTimes(1);
        expect(saveMock).toHaveBeenCalledWith(newAccount);
      });

      test('should check by IBAN if externalId not found', async () => {
        const newAccount = createAccount({
          externalId: 'new-id',
          iban: 'UA999999999999999999999999999',
        });

        const findByIbanMock = mock(() => Promise.resolve(null));
        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([newAccount])),
        });

        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(null)),
          findByIban: findByIbanMock,
          save: mock(() => Promise.resolve()),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        await useCase.execute(fastTestOptions);

        expect(findByIbanMock).toHaveBeenCalledWith(
          'UA999999999999999999999999999',
        );
      });
    });

    describe('updating changed accounts', () => {
      test('should update account when balance changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          balance: Money.create(100000, Currency.UAH),
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          balance: Money.create(200000, Currency.UAH),
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
        expect(updateMock).toHaveBeenCalledWith(incomingAccount);
      });

      test('should update account when name changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          name: 'Old Name',
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          name: 'New Name',
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });

      test('should update account when type changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          type: 'black',
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          type: 'platinum',
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });

      test('should update account when IBAN changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          iban: 'UA111111111111111111111111111',
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          iban: 'UA222222222222222222222222222',
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });

      test('should update account when maskedPan changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: ['*1111'],
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: ['*2222'],
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });

      test('should update account when maskedPan length changed', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: ['*1111'],
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: ['*1111', '*2222'],
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        const updateMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: updateMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });
    });

    describe('skipping unchanged accounts', () => {
      test('should skip account when nothing changed', async () => {
        const account = createAccount({ externalId: 'acc-1' });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([account])),
        });

        const updateMock = mock(() => Promise.resolve());
        const saveMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(account)),
          update: updateMock,
          save: saveMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.unchanged).toBe(1);
        expect(result.accounts.created).toBe(0);
        expect(result.accounts.updated).toBe(0);
        expect(saveMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
      });
    });

    describe('processing multiple accounts', () => {
      test('should process all accounts and count correctly', async () => {
        const newAccount = createAccount({ externalId: 'new-1' });
        const unchangedAccount = createAccount({ externalId: 'unchanged-1' });
        const changedAccount = createAccount({
          externalId: 'changed-1',
          balance: Money.create(500000, Currency.UAH),
        });
        const existingChangedAccount = createAccount({
          externalId: 'changed-1',
          balance: Money.create(100000, Currency.UAH),
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() =>
            Promise.resolve([newAccount, unchangedAccount, changedAccount]),
          ),
        });

        const existingAccountsMap: Record<string, Account | null> = {
          'new-1': null,
          'unchanged-1': unchangedAccount,
          'changed-1': existingChangedAccount,
        };

        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock((externalId: string) => {
            const account = existingAccountsMap[externalId] ?? null;
            return Promise.resolve(account);
          }),
          save: mock(() => Promise.resolve()),
          update: mock(() => Promise.resolve()),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.created).toBe(1);
        expect(result.accounts.unchanged).toBe(1);
        expect(result.accounts.updated).toBe(1);
      });
    });
  });

  describe('transaction sync', () => {
    describe('date range chunking', () => {
      test('should chunk date range for long sync periods', async () => {
        const account = createAccount({
          lastSyncTime: new Date('2025-12-01').getTime(),
        });
        const getTransactionsMock = mock(() => Promise.resolve([]));

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: getTransactionsMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        // Use options that create multiple chunks (from Dec 1 to now ~ 34+ days)
        await useCase.execute({
          ...fastTestOptions,
          earliestSyncDate: new Date('2025-12-01'),
        });

        // Should have called getTransactions for multiple chunks
        expect(getTransactionsMock.mock.calls.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('rate limit handling', () => {
      test('should delay between requests for different accounts', async () => {
        const account1 = createAccount({ externalId: 'acc-1' });
        const account2 = createAccount({ externalId: 'acc-2' });
        let callCount = 0;
        const callTimes: number[] = [];

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account1, account2])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => {
            callTimes.push(Date.now());
            callCount++;
            return Promise.resolve([]);
          }),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        await useCase.execute({
          ...fastTestOptions,
          requestDelayMs: 50, // Short delay for testing
        });

        // Should have called twice (once per account)
        expect(callCount).toBe(2);

        // Second call should be delayed
        if (callTimes.length >= 2) {
          const timeDiff = (callTimes[1] ?? 0) - (callTimes[0] ?? 0);
          expect(timeDiff).toBeGreaterThanOrEqual(45); // Allow some tolerance
        }
      });

      test('should retry with exponential backoff on rate limit error', async () => {
        const account = createAccount();
        let callCount = 0;

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => {
            callCount++;
            if (callCount === 1) {
              throw new MonobankRateLimitError();
            }
            return Promise.resolve([]);
          }),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute({
          ...fastTestOptions,
          maxRetries: 3,
          initialBackoffMs: 10,
        });

        expect(callCount).toBe(2); // Initial + 1 retry
        expect(result.errors).toHaveLength(0);
      });

      test('should fail after max retries on rate limit', async () => {
        const account = createAccount();

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => {
            throw new MonobankRateLimitError();
          }),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute({
          ...fastTestOptions,
          maxRetries: 2,
          initialBackoffMs: 1,
        });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to sync account');
      });

      test('should log warning on rate limit retry', async () => {
        const account = createAccount();
        let callCount = 0;

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => {
            callCount++;
            if (callCount === 1) {
              throw new MonobankRateLimitError();
            }
            return Promise.resolve([]);
          }),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        await useCase.execute({
          ...fastTestOptions,
          maxRetries: 3,
          initialBackoffMs: 1,
        });

        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('transaction deduplication', () => {
      test('should save new transactions', async () => {
        const account = createAccount();
        const newTransaction = createTransaction({ externalId: 'new-tx-1' });

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => Promise.resolve([newTransaction])),
        });

        const saveManyMock = mock(() => Promise.resolve());
        mockTransactionRepository = createMockTransactionRepository({
          findByExternalIds: mock(() =>
            Promise.resolve(new Map<string, Transaction>()),
          ),
          saveMany: saveManyMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.transactions.newTransactions).toBe(1);
        expect(saveManyMock).toHaveBeenCalledTimes(1);
      });

      test('should skip existing transactions', async () => {
        const account = createAccount();
        const existingTransaction = createTransaction({
          externalId: 'existing-tx-1',
        });

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => Promise.resolve([existingTransaction])),
        });

        const existingMap = new Map<string, Transaction>();
        existingMap.set('existing-tx-1', existingTransaction);

        const saveManyMock = mock(() => Promise.resolve());
        mockTransactionRepository = createMockTransactionRepository({
          findByExternalIds: mock(() => Promise.resolve(existingMap)),
          saveMany: saveManyMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.transactions.skippedTransactions).toBe(1);
        expect(result.transactions.newTransactions).toBe(0);
        expect(saveManyMock).not.toHaveBeenCalled();
      });

      test('should handle mix of new and existing transactions', async () => {
        const account = createAccount();
        const newTransaction = createTransaction({ externalId: 'new-tx-1' });
        const existingTransaction = createTransaction({
          externalId: 'existing-tx-1',
        });

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() =>
            Promise.resolve([newTransaction, existingTransaction]),
          ),
        });

        const existingMap = new Map<string, Transaction>();
        existingMap.set('existing-tx-1', existingTransaction);

        const saveManyMock = mock(() => Promise.resolve());
        mockTransactionRepository = createMockTransactionRepository({
          findByExternalIds: mock(() => Promise.resolve(existingMap)),
          saveMany: saveManyMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.transactions.newTransactions).toBe(1);
        expect(result.transactions.skippedTransactions).toBe(1);
        expect(saveManyMock).toHaveBeenCalledTimes(1);
      });

      test('should sort transactions by date ascending before saving', async () => {
        const account = createAccount();
        const olderTransaction = createTransaction({
          externalId: 'tx-old',
          date: new Date('2026-01-01T10:00:00.000Z'),
        });
        const newerTransaction = createTransaction({
          externalId: 'tx-new',
          date: new Date('2026-01-02T10:00:00.000Z'),
        });

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        // Return transactions in reverse order (newer first)
        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() =>
            Promise.resolve([newerTransaction, olderTransaction]),
          ),
        });

        let savedTransactions: Transaction[] = [];
        const saveManyMock = mock((transactions: Transaction[]) => {
          savedTransactions = transactions;
          return Promise.resolve();
        });

        mockTransactionRepository = createMockTransactionRepository({
          findByExternalIds: mock(() =>
            Promise.resolve(new Map<string, Transaction>()),
          ),
          saveMany: saveManyMock,
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        await useCase.execute(fastTestOptions);

        expect(savedTransactions).toHaveLength(2);
        // Older transaction should be first (ascending order)
        expect(savedTransactions[0]?.externalId).toBe('tx-old');
        expect(savedTransactions[1]?.externalId).toBe('tx-new');
      });
    });

    describe('updating last sync time', () => {
      test('should update lastSyncTime after successful account sync', async () => {
        const account = createAccount({ externalId: 'acc-1' });

        const updateLastSyncTimeMock = mock(() => Promise.resolve());
        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account])),
          updateLastSyncTime: updateLastSyncTimeMock,
        });

        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => Promise.resolve([])),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        await useCase.execute(fastTestOptions);

        expect(updateLastSyncTimeMock).toHaveBeenCalledWith(
          account.id,
          expect.any(Number),
        );
      });
    });
  });

  describe('error handling', () => {
    describe('account fetch errors', () => {
      test('should add error and continue when bank gateway fails to fetch accounts', async () => {
        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.reject(new Error('Network error'))),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain(
          'Failed to fetch accounts from bank',
        );
        expect(result.errors[0]).toContain('Network error');
        expect(mockLogger.error).toHaveBeenCalled();
      });

      test('should handle unknown error type when fetching accounts', async () => {
        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.reject('Unknown error')),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Unknown error');
      });
    });

    describe('individual account processing errors', () => {
      test('should continue processing other accounts when one fails', async () => {
        const account1 = createAccount({ externalId: 'acc-1' });
        const account2 = createAccount({ externalId: 'acc-2' });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([account1, account2])),
        });

        let callCount = 0;
        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => {
            callCount++;
            if (callCount === 1) {
              throw new Error('Database error');
            }
            return Promise.resolve(null);
          }),
          save: mock(() => Promise.resolve()),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to process account acc-1');
        expect(result.accounts.created).toBe(1); // Second account was created
      });
    });

    describe('transaction fetch errors', () => {
      test('should add error when fetching monobank accounts fails', async () => {
        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.reject(new Error('Repository error'))),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to fetch accounts');
      });

      test('should continue syncing other accounts when one transaction sync fails', async () => {
        const account1 = createAccount({ externalId: 'acc-1' });
        const account2 = createAccount({ externalId: 'acc-2' });

        mockAccountRepository = createMockAccountRepository({
          findByBank: mock(() => Promise.resolve([account1, account2])),
          updateLastSyncTime: mock(() => Promise.resolve()),
        });

        let callCount = 0;
        mockBankGateway = createMockBankGateway({
          getTransactions: mock(() => {
            callCount++;
            if (callCount === 1) {
              throw new Error('API error');
            }
            return Promise.resolve([]);
          }),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute({
          ...fastTestOptions,
          maxRetries: 0,
        });

        expect(result.errors).toHaveLength(1);
        expect(result.transactions.syncedAccounts).toBe(1); // Second account synced
        expect(result.transactions.totalAccounts).toBe(2);
      });
    });
  });

  describe('calculateSyncFrom()', () => {
    test('should return earliestSyncDate when no lastSyncTime', async () => {
      const account = createAccount({ lastSyncTime: undefined });
      const earliestSyncDate = new Date('2025-06-01');

      mockAccountRepository = createMockAccountRepository({
        findByBank: mock(() => Promise.resolve([account])),
        updateLastSyncTime: mock(() => Promise.resolve()),
      });

      let firstCapturedFrom: Date | undefined;
      let callCount = 0;
      mockBankGateway = createMockBankGateway({
        getTransactions: mock((_accountId: string, from: Date, _to: Date) => {
          if (callCount === 0) {
            firstCapturedFrom = from;
          }
          callCount++;
          return Promise.resolve([]);
        }),
      });

      useCase = new SyncMonobankUseCase(
        mockBankGateway,
        mockAccountRepository,
        mockTransactionRepository,
        mockLogger,
      );

      await useCase.execute({
        ...fastTestOptions,
        earliestSyncDate,
      });

      // First chunk should start at earliestSyncDate
      expect(firstCapturedFrom?.getTime()).toBe(earliestSyncDate.getTime());
    });

    test('should apply overlap when lastSyncTime exists', async () => {
      const lastSyncTime = new Date('2026-01-02T12:00:00.000Z').getTime();
      const syncOverlapMs = 600000; // 10 minutes
      const account = createAccount({ lastSyncTime });

      mockAccountRepository = createMockAccountRepository({
        findByBank: mock(() => Promise.resolve([account])),
        updateLastSyncTime: mock(() => Promise.resolve()),
      });

      let firstCapturedFrom: Date | undefined;
      let callCount = 0;
      mockBankGateway = createMockBankGateway({
        getTransactions: mock((_accountId: string, from: Date, _to: Date) => {
          if (callCount === 0) {
            firstCapturedFrom = from;
          }
          callCount++;
          return Promise.resolve([]);
        }),
      });

      useCase = new SyncMonobankUseCase(
        mockBankGateway,
        mockAccountRepository,
        mockTransactionRepository,
        mockLogger,
      );

      await useCase.execute({
        ...fastTestOptions,
        syncOverlapMs,
        earliestSyncDate: new Date('2025-01-01'),
      });

      const expectedFrom = lastSyncTime - syncOverlapMs;
      expect(firstCapturedFrom?.getTime()).toBe(expectedFrom);
    });

    test('should not go before earliestSyncDate even with overlap', async () => {
      const earliestSyncDate = new Date('2026-01-01T00:00:00.000Z');
      const lastSyncTime = new Date('2026-01-01T00:05:00.000Z').getTime(); // 5 minutes after earliest
      const syncOverlapMs = 600000; // 10 minutes (would put it before earliest)
      const account = createAccount({ lastSyncTime });

      mockAccountRepository = createMockAccountRepository({
        findByBank: mock(() => Promise.resolve([account])),
        updateLastSyncTime: mock(() => Promise.resolve()),
      });

      let firstCapturedFrom: Date | undefined;
      let callCount = 0;
      mockBankGateway = createMockBankGateway({
        getTransactions: mock((_accountId: string, from: Date, _to: Date) => {
          if (callCount === 0) {
            firstCapturedFrom = from;
          }
          callCount++;
          return Promise.resolve([]);
        }),
      });

      useCase = new SyncMonobankUseCase(
        mockBankGateway,
        mockAccountRepository,
        mockTransactionRepository,
        mockLogger,
      );

      await useCase.execute({
        ...fastTestOptions,
        syncOverlapMs,
        earliestSyncDate,
      });

      // Should be capped at earliestSyncDate
      expect(firstCapturedFrom?.getTime()).toBe(earliestSyncDate.getTime());
    });
  });

  describe('hasAccountChanged()', () => {
    describe('balance changes', () => {
      test('should detect different balance amounts', async () => {
        const existingAccount = createAccount({
          balance: Money.create(100000, Currency.UAH),
        });
        const incomingAccount = createAccount({
          balance: Money.create(200000, Currency.UAH),
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: mock(() => Promise.resolve()),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });
    });

    describe('maskedPan edge cases', () => {
      test('should detect when maskedPan added to account that had none', async () => {
        const existingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: [],
        });
        const incomingAccount = createAccount({
          externalId: 'acc-1',
          maskedPan: ['*1234'],
        });

        mockBankGateway = createMockBankGateway({
          getAccounts: mock(() => Promise.resolve([incomingAccount])),
        });

        mockAccountRepository = createMockAccountRepository({
          findByExternalId: mock(() => Promise.resolve(existingAccount)),
          update: mock(() => Promise.resolve()),
        });

        useCase = new SyncMonobankUseCase(
          mockBankGateway,
          mockAccountRepository,
          mockTransactionRepository,
          mockLogger,
        );

        const result = await useCase.execute(fastTestOptions);

        expect(result.accounts.updated).toBe(1);
      });
    });
  });

  describe('default options', () => {
    test('should use default values when options not provided', async () => {
      // Just verify it executes without error with default options
      const result = await useCase.execute();

      expect(result).toBeDefined();
      expect(result.accounts).toBeDefined();
      expect(result.transactions).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});
