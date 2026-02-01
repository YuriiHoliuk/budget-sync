import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { DualWriteAccountRepository } from '@infrastructure/repositories/DualWriteAccountRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';

describe('DualWriteAccountRepository', () => {
  const createMockLogger = (): Logger => ({
    info: mock(() => {
      /* no-op */
    }),
    warn: mock(() => {
      /* no-op */
    }),
    error: mock(() => {
      /* no-op */
    }),
    debug: mock(() => {
      /* no-op */
    }),
  });

  const createMockAccount = (): Account => {
    return Account.create({
      externalId: 'ext-123',
      name: 'Test Account',
      currency: Currency.UAH,
      balance: Money.create(50000, Currency.UAH),
    });
  };

  describe('read operations', () => {
    test('findById should call DB repo only', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        findById: mock(() => Promise.resolve(mockAccount)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        findById: mock(() => Promise.resolve(null)),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findById('ext-123');

      expect(result).toBe(mockAccount);
      expect(mockDbRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.findById).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.findById).not.toHaveBeenCalled();
    });

    test('findAll should call DB repo only', async () => {
      const mockAccounts = [createMockAccount()];
      const mockDbRepo: AccountRepository = {
        findAll: mock(() => Promise.resolve(mockAccounts)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        findAll: mock(() => Promise.resolve([])),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findAll();

      expect(result).toBe(mockAccounts);
      expect(mockDbRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findAll).not.toHaveBeenCalled();
    });

    test('findByExternalId should call DB repo only', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        findByExternalId: mock(() => Promise.resolve(mockAccount)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        findByExternalId: mock(() => Promise.resolve(null)),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByExternalId('ext-123');

      expect(result).toBe(mockAccount);
      expect(mockDbRepo.findByExternalId).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.findByExternalId).not.toHaveBeenCalled();
    });

    test('findByIban should call DB repo only', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        findByIban: mock(() => Promise.resolve(mockAccount)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        findByIban: mock(() => Promise.resolve(null)),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByIban('UA123456789012345678901234');

      expect(result).toBe(mockAccount);
      expect(mockDbRepo.findByIban).toHaveBeenCalledWith(
        'UA123456789012345678901234',
      );
      expect(mockSpreadsheetRepo.findByIban).not.toHaveBeenCalled();
    });

    test('findByBank should call DB repo only', async () => {
      const mockAccounts = [createMockAccount()];
      const mockDbRepo: AccountRepository = {
        findByBank: mock(() => Promise.resolve(mockAccounts)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        findByBank: mock(() => Promise.resolve([])),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByBank('Monobank');

      expect(result).toBe(mockAccounts);
      expect(mockDbRepo.findByBank).toHaveBeenCalledWith('Monobank');
      expect(mockSpreadsheetRepo.findByBank).not.toHaveBeenCalled();
    });
  });

  describe('write operations', () => {
    test('save should write to DB first, then spreadsheet', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.save(mockAccount);

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.save).toHaveBeenCalledWith(mockAccount);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(mockAccount);
    });

    test('spreadsheet failure should be logged but not thrown on save', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const spreadsheetError = new Error('Spreadsheet error');
      const mockSpreadsheetRepo: AccountRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as AccountRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockAccount)).resolves.toBeUndefined();

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet error' },
      );
    });

    test('saveAndReturn should return entity from DB', async () => {
      const mockAccount = createMockAccount();
      const savedAccount = mockAccount.withDbId(123);

      const mockDbRepo: AccountRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedAccount)),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.saveAndReturn(mockAccount);

      expect(result).toBe(savedAccount);
      expect(mockDbRepo.saveAndReturn).toHaveBeenCalledWith(mockAccount);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(savedAccount);
    });

    test('update should write to DB first, then spreadsheet', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        update: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        update: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.update(mockAccount);

      expect(mockDbRepo.update).toHaveBeenCalledWith(mockAccount);
      expect(mockSpreadsheetRepo.update).toHaveBeenCalledWith(mockAccount);
    });

    test('delete should write to DB first, then spreadsheet', async () => {
      const mockDbRepo: AccountRepository = {
        delete: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        delete: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.delete('ext-123');

      expect(mockDbRepo.delete).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.delete).toHaveBeenCalledWith('ext-123');
    });

    test('updateLastSyncTime should write to DB first, then spreadsheet', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const mockDbRepo: AccountRepository = {
        updateLastSyncTime: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        updateLastSyncTime: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.updateLastSyncTime('ext-123', timestamp);

      expect(mockDbRepo.updateLastSyncTime).toHaveBeenCalledWith(
        'ext-123',
        timestamp,
      );
      expect(mockSpreadsheetRepo.updateLastSyncTime).toHaveBeenCalledWith(
        'ext-123',
        timestamp,
      );
    });

    test('updateBalance should write to DB first, then spreadsheet', async () => {
      const newBalance = Money.create(100000, Currency.UAH);
      const mockDbRepo: AccountRepository = {
        updateBalance: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        updateBalance: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.updateBalance('ext-123', newBalance);

      expect(mockDbRepo.updateBalance).toHaveBeenCalledWith(
        'ext-123',
        newBalance,
      );
      expect(mockSpreadsheetRepo.updateBalance).toHaveBeenCalledWith(
        'ext-123',
        newBalance,
      );
    });

    test('should handle non-Error objects in spreadsheet failures', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        save: mock(() => Promise.reject('String error')),
      } as unknown as AccountRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockAccount)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'String error' },
      );
    });

    test('spreadsheet failure should not affect DB write on update', async () => {
      const mockAccount = createMockAccount();
      const mockDbRepo: AccountRepository = {
        update: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        update: mock(() => Promise.reject(new Error('Spreadsheet down'))),
      } as unknown as AccountRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.update(mockAccount)).resolves.toBeUndefined();

      expect(mockDbRepo.update).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet down' },
      );
    });

    test('spreadsheet failure should not affect DB write on updateLastSyncTime', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const mockDbRepo: AccountRepository = {
        updateLastSyncTime: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        updateLastSyncTime: mock(() =>
          Promise.reject(new Error('Spreadsheet down')),
        ),
      } as unknown as AccountRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(
        repo.updateLastSyncTime('ext-123', timestamp),
      ).resolves.toBeUndefined();

      expect(mockDbRepo.updateLastSyncTime).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet down' },
      );
    });

    test('spreadsheet failure should not affect DB write on updateBalance', async () => {
      const newBalance = Money.create(100000, Currency.UAH);
      const mockDbRepo: AccountRepository = {
        updateBalance: mock(() => Promise.resolve()),
      } as unknown as AccountRepository;

      const mockSpreadsheetRepo: AccountRepository = {
        updateBalance: mock(() =>
          Promise.reject(new Error('Spreadsheet down')),
        ),
      } as unknown as AccountRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteAccountRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(
        repo.updateBalance('ext-123', newBalance),
      ).resolves.toBeUndefined();

      expect(mockDbRepo.updateBalance).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet down' },
      );
    });
  });
});
