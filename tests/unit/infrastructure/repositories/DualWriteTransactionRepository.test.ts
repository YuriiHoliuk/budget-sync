import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { Transaction } from '@domain/entities/Transaction.ts';
import type {
  CategorizationUpdate,
  TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import {
  CategorizationStatus,
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { DualWriteTransactionRepository } from '@infrastructure/repositories/DualWriteTransactionRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';

describe('DualWriteTransactionRepository', () => {
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

  const createMockTransaction = (): Transaction => {
    return Transaction.create({
      externalId: 'ext-123',
      date: new Date(),
      amount: Money.create(5000, Currency.UAH),
      description: 'Test transaction',
      type: TransactionType.DEBIT,
      accountId: 'acc-1',
    });
  };

  describe('read operations', () => {
    test('findById should call DB repo only', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        findById: mock(() => Promise.resolve(mockTransaction)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findById: mock(() => Promise.resolve(null)),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findById('ext-123');

      expect(result).toBe(mockTransaction);
      expect(mockDbRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.findById).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.findById).not.toHaveBeenCalled();
    });

    test('findAll should call DB repo only', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        findAll: mock(() => Promise.resolve(mockTransactions)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findAll: mock(() => Promise.resolve([])),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findAll();

      expect(result).toBe(mockTransactions);
      expect(mockDbRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findAll).not.toHaveBeenCalled();
    });

    test('findByExternalId should call DB repo only', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        findByExternalId: mock(() => Promise.resolve(mockTransaction)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findByExternalId: mock(() => Promise.resolve(null)),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByExternalId('ext-123');

      expect(result).toBe(mockTransaction);
      expect(mockDbRepo.findByExternalId).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.findByExternalId).not.toHaveBeenCalled();
    });

    test('findByExternalIds should call DB repo only', async () => {
      const mockMap = new Map([['ext-123', createMockTransaction()]]);
      const mockDbRepo: TransactionRepository = {
        findByExternalIds: mock(() => Promise.resolve(mockMap)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findByExternalIds: mock(() => Promise.resolve(new Map())),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByExternalIds(['ext-123', 'ext-456']);

      expect(result).toBe(mockMap);
      expect(mockDbRepo.findByExternalIds).toHaveBeenCalledWith([
        'ext-123',
        'ext-456',
      ]);
      expect(mockSpreadsheetRepo.findByExternalIds).not.toHaveBeenCalled();
    });

    test('findByAccountId should call DB repo only', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        findByAccountId: mock(() => Promise.resolve(mockTransactions)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findByAccountId: mock(() => Promise.resolve([])),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByAccountId('acc-1');

      expect(result).toBe(mockTransactions);
      expect(mockDbRepo.findByAccountId).toHaveBeenCalledWith('acc-1');
      expect(mockSpreadsheetRepo.findByAccountId).not.toHaveBeenCalled();
    });

    test('findByCategorizationStatus should call DB repo only', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        findByCategorizationStatus: mock(() =>
          Promise.resolve(mockTransactions),
        ),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findByCategorizationStatus: mock(() => Promise.resolve([])),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByCategorizationStatus(
        CategorizationStatus.PENDING,
      );

      expect(result).toBe(mockTransactions);
      expect(mockDbRepo.findByCategorizationStatus).toHaveBeenCalledWith(
        CategorizationStatus.PENDING,
      );
      expect(
        mockSpreadsheetRepo.findByCategorizationStatus,
      ).not.toHaveBeenCalled();
    });

    test('findUncategorized should call DB repo only', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        findUncategorized: mock(() => Promise.resolve(mockTransactions)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        findUncategorized: mock(() => Promise.resolve([])),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findUncategorized();

      expect(result).toBe(mockTransactions);
      expect(mockDbRepo.findUncategorized).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findUncategorized).not.toHaveBeenCalled();
    });
  });

  describe('write operations', () => {
    test('save should write to DB first, then spreadsheet', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.save(mockTransaction);

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.save).toHaveBeenCalledWith(mockTransaction);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(mockTransaction);
    });

    test('spreadsheet failure should be logged but not thrown on save', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const spreadsheetError = new Error('Spreadsheet error');
      const mockSpreadsheetRepo: TransactionRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as TransactionRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockTransaction)).resolves.toBeUndefined();

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet error' },
      );
    });

    test('saveAndReturn should return entity from DB', async () => {
      const mockTransaction = createMockTransaction();
      const savedTransaction = mockTransaction.withDbId(123);

      const mockDbRepo: TransactionRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedTransaction)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.saveAndReturn(mockTransaction);

      expect(result).toBe(savedTransaction);
      expect(mockDbRepo.saveAndReturn).toHaveBeenCalledWith(mockTransaction);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(savedTransaction);
    });

    test('saveMany should write to DB first, then spreadsheet', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        saveMany: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        saveMany: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.saveMany(mockTransactions);

      expect(mockDbRepo.saveMany).toHaveBeenCalledWith(mockTransactions);
      expect(mockSpreadsheetRepo.saveMany).toHaveBeenCalledWith(
        mockTransactions,
      );
    });

    test('saveManyAndReturn should return entities from DB', async () => {
      const mockTransactions = [createMockTransaction()];
      const savedTransactions = mockTransactions.map((tx) => tx.withDbId(123));

      const mockDbRepo: TransactionRepository = {
        saveManyAndReturn: mock(() => Promise.resolve(savedTransactions)),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        saveMany: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.saveManyAndReturn(mockTransactions);

      expect(result).toBe(savedTransactions);
      expect(mockDbRepo.saveManyAndReturn).toHaveBeenCalledWith(
        mockTransactions,
      );
      expect(mockSpreadsheetRepo.saveMany).toHaveBeenCalledWith(
        savedTransactions,
      );
    });

    test('update should write to DB first, then spreadsheet', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        update: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        update: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.update(mockTransaction);

      expect(mockDbRepo.update).toHaveBeenCalledWith(mockTransaction);
      expect(mockSpreadsheetRepo.update).toHaveBeenCalledWith(mockTransaction);
    });

    test('updateMany should write to DB first, then spreadsheet', async () => {
      const mockTransactions = [createMockTransaction()];
      const mockDbRepo: TransactionRepository = {
        updateMany: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        updateMany: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.updateMany(mockTransactions);

      expect(mockDbRepo.updateMany).toHaveBeenCalledWith(mockTransactions);
      expect(mockSpreadsheetRepo.updateMany).toHaveBeenCalledWith(
        mockTransactions,
      );
    });

    test('updateCategorization should write to DB first, then spreadsheet', async () => {
      const categorizationData: CategorizationUpdate = {
        status: CategorizationStatus.CATEGORIZED,
        category: 'Food & Drinks',
        budget: 'Monthly Budget',
        categoryReason: 'Auto-categorized',
        budgetReason: 'Auto-budgeted',
      };

      const mockDbRepo: TransactionRepository = {
        updateCategorization: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        updateCategorization: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.updateCategorization('ext-123', categorizationData);

      expect(mockDbRepo.updateCategorization).toHaveBeenCalledWith(
        'ext-123',
        categorizationData,
      );
      expect(mockSpreadsheetRepo.updateCategorization).toHaveBeenCalledWith(
        'ext-123',
        categorizationData,
      );
    });

    test('delete should write to DB first, then spreadsheet', async () => {
      const mockDbRepo: TransactionRepository = {
        delete: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        delete: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.delete('ext-123');

      expect(mockDbRepo.delete).toHaveBeenCalledWith('ext-123');
      expect(mockSpreadsheetRepo.delete).toHaveBeenCalledWith('ext-123');
    });

    test('should handle non-Error objects in spreadsheet failures', async () => {
      const mockTransaction = createMockTransaction();
      const mockDbRepo: TransactionRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as TransactionRepository;

      const mockSpreadsheetRepo: TransactionRepository = {
        save: mock(() => Promise.reject('String error')),
      } as unknown as TransactionRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteTransactionRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockTransaction)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'String error' },
      );
    });
  });
});
