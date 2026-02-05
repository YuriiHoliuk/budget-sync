import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { Budget } from '@domain/entities/Budget.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import { DualWriteBudgetRepository } from '@infrastructure/repositories/DualWriteBudgetRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { createTestBudget } from '../../helpers/fixtures.ts';

describe('DualWriteBudgetRepository', () => {
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

  const createMockBudget = (): Budget => {
    return createTestBudget({ name: 'Test Budget', dbId: undefined });
  };

  describe('read operations', () => {
    test('findAll should call DB repo only', async () => {
      const mockBudgets = [createMockBudget()];
      const mockDbRepo: BudgetRepository = {
        findAll: mock(() => Promise.resolve(mockBudgets)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        findAll: mock(() => Promise.resolve([])),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findAll();

      expect(result).toBe(mockBudgets);
      expect(mockDbRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findAll).not.toHaveBeenCalled();
    });

    test('findById should call DB repo only', async () => {
      const mockBudget = createMockBudget();
      const mockDbRepo: BudgetRepository = {
        findById: mock(() => Promise.resolve(mockBudget)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        findById: mock(() => Promise.resolve(null)),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findById(1);

      expect(result).toBe(mockBudget);
      expect(mockDbRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.findById).toHaveBeenCalledWith(1);
      expect(mockSpreadsheetRepo.findById).not.toHaveBeenCalled();
    });

    test('findByName should call DB repo only', async () => {
      const mockBudget = createMockBudget();
      const mockDbRepo: BudgetRepository = {
        findByName: mock(() => Promise.resolve(mockBudget)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        findByName: mock(() => Promise.resolve(null)),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByName('Test Budget');

      expect(result).toBe(mockBudget);
      expect(mockDbRepo.findByName).toHaveBeenCalledWith('Test Budget');
      expect(mockSpreadsheetRepo.findByName).not.toHaveBeenCalled();
    });

    test('findActive should call DB repo only', async () => {
      const mockBudgets = [createMockBudget()];
      const testDate = new Date('2026-02-01');
      const mockDbRepo: BudgetRepository = {
        findActive: mock(() => Promise.resolve(mockBudgets)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        findActive: mock(() => Promise.resolve([])),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findActive(testDate);

      expect(result).toBe(mockBudgets);
      expect(mockDbRepo.findActive).toHaveBeenCalledWith(testDate);
      expect(mockSpreadsheetRepo.findActive).not.toHaveBeenCalled();
    });
  });

  describe('write operations', () => {
    test('save should write to DB first, then spreadsheet', async () => {
      const mockBudget = createMockBudget();
      const mockDbRepo: BudgetRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.save(mockBudget);

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.save).toHaveBeenCalledWith(mockBudget);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(mockBudget);
    });

    test('spreadsheet failure should be logged but not thrown on save', async () => {
      const mockBudget = createMockBudget();
      const mockDbRepo: BudgetRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as BudgetRepository;

      const spreadsheetError = new Error('Spreadsheet error');
      const mockSpreadsheetRepo: BudgetRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as BudgetRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockBudget)).resolves.toBeUndefined();

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet error' },
      );
    });

    test('saveAndReturn should return entity from DB', async () => {
      const mockBudget = createMockBudget();
      const savedBudget = mockBudget.withDbId(123);

      const mockDbRepo: BudgetRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedBudget)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.saveAndReturn(mockBudget);

      expect(result).toBe(savedBudget);
      expect(mockDbRepo.saveAndReturn).toHaveBeenCalledWith(mockBudget);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(savedBudget);
    });

    test('spreadsheet failure should be logged but not thrown on saveAndReturn', async () => {
      const mockBudget = createMockBudget();
      const savedBudget = mockBudget.withDbId(123);

      const mockDbRepo: BudgetRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedBudget)),
      } as unknown as BudgetRepository;

      const spreadsheetError = new Error('Spreadsheet save failed');
      const mockSpreadsheetRepo: BudgetRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as BudgetRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      const result = await repo.saveAndReturn(mockBudget);

      expect(result).toBe(savedBudget);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet save failed' },
      );
    });

    test('update should delegate to DB repo only', async () => {
      const mockBudget = createMockBudget().withDbId(123);
      const updatedBudget = mockBudget.withUpdatedProps({ name: 'Updated' });

      const mockDbRepo: BudgetRepository = {
        update: mock(() => Promise.resolve(updatedBudget)),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        update: mock(() => Promise.resolve(updatedBudget)),
      } as unknown as BudgetRepository;

      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.update(mockBudget);

      expect(result).toBe(updatedBudget);
      expect(mockDbRepo.update).toHaveBeenCalledWith(mockBudget);
      // Note: DualWriteBudgetRepository.update only calls DB repo, not spreadsheet
      expect(mockSpreadsheetRepo.update).not.toHaveBeenCalled();
    });

    test('should handle non-Error objects in spreadsheet failures', async () => {
      const mockBudget = createMockBudget();
      const mockDbRepo: BudgetRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as BudgetRepository;

      const mockSpreadsheetRepo: BudgetRepository = {
        save: mock(() => Promise.reject('String error')),
      } as unknown as BudgetRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteBudgetRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockBudget)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'String error' },
      );
    });
  });
});
