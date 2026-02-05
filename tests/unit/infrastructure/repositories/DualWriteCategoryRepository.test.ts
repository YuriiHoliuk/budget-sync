import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { Category } from '@domain/entities/Category.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import { DualWriteCategoryRepository } from '@infrastructure/repositories/DualWriteCategoryRepository.ts';
import type { Logger } from '@modules/logging/Logger.ts';
import { createTestCategory } from '../../helpers/fixtures.ts';

describe('DualWriteCategoryRepository', () => {
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

  const createMockCategory = (): Category => {
    return createTestCategory({ name: 'Test Category', dbId: undefined });
  };

  describe('read operations', () => {
    test('findAll should call DB repo only', async () => {
      const mockCategories = [createMockCategory()];
      const mockDbRepo: CategoryRepository = {
        findAll: mock(() => Promise.resolve(mockCategories)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        findAll: mock(() => Promise.resolve([])),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findAll();

      expect(result).toBe(mockCategories);
      expect(mockDbRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findAll).not.toHaveBeenCalled();
    });

    test('findById should call DB repo only', async () => {
      const mockCategory = createMockCategory();
      const mockDbRepo: CategoryRepository = {
        findById: mock(() => Promise.resolve(mockCategory)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        findById: mock(() => Promise.resolve(null)),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findById(1);

      expect(result).toBe(mockCategory);
      expect(mockDbRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.findById).toHaveBeenCalledWith(1);
      expect(mockSpreadsheetRepo.findById).not.toHaveBeenCalled();
    });

    test('findByName should call DB repo only', async () => {
      const mockCategory = createMockCategory();
      const mockDbRepo: CategoryRepository = {
        findByName: mock(() => Promise.resolve(mockCategory)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        findByName: mock(() => Promise.resolve(null)),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findByName('Test Category');

      expect(result).toBe(mockCategory);
      expect(mockDbRepo.findByName).toHaveBeenCalledWith('Test Category');
      expect(mockSpreadsheetRepo.findByName).not.toHaveBeenCalled();
    });

    test('findActive should call DB repo only', async () => {
      const mockCategories = [createMockCategory()];
      const mockDbRepo: CategoryRepository = {
        findActive: mock(() => Promise.resolve(mockCategories)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        findActive: mock(() => Promise.resolve([])),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.findActive();

      expect(result).toBe(mockCategories);
      expect(mockDbRepo.findActive).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.findActive).not.toHaveBeenCalled();
    });
  });

  describe('write operations', () => {
    test('save should write to DB first, then spreadsheet', async () => {
      const mockCategory = createMockCategory();
      const mockDbRepo: CategoryRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      await repo.save(mockCategory);

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockDbRepo.save).toHaveBeenCalledWith(mockCategory);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(mockCategory);
    });

    test('spreadsheet failure should be logged but not thrown on save', async () => {
      const mockCategory = createMockCategory();
      const mockDbRepo: CategoryRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as CategoryRepository;

      const spreadsheetError = new Error('Spreadsheet error');
      const mockSpreadsheetRepo: CategoryRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as CategoryRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockCategory)).resolves.toBeUndefined();

      expect(mockDbRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet error' },
      );
    });

    test('saveAndReturn should return entity from DB', async () => {
      const mockCategory = createMockCategory();
      const savedCategory = mockCategory.withDbId(123);

      const mockDbRepo: CategoryRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedCategory)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.saveAndReturn(mockCategory);

      expect(result).toBe(savedCategory);
      expect(mockDbRepo.saveAndReturn).toHaveBeenCalledWith(mockCategory);
      expect(mockSpreadsheetRepo.save).toHaveBeenCalledWith(savedCategory);
    });

    test('spreadsheet failure should be logged but not thrown on saveAndReturn', async () => {
      const mockCategory = createMockCategory();
      const savedCategory = mockCategory.withDbId(123);

      const mockDbRepo: CategoryRepository = {
        saveAndReturn: mock(() => Promise.resolve(savedCategory)),
      } as unknown as CategoryRepository;

      const spreadsheetError = new Error('Spreadsheet save failed');
      const mockSpreadsheetRepo: CategoryRepository = {
        save: mock(() => Promise.reject(spreadsheetError)),
      } as unknown as CategoryRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      const result = await repo.saveAndReturn(mockCategory);

      expect(result).toBe(savedCategory);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'Spreadsheet save failed' },
      );
    });

    test('update should delegate to DB repo only', async () => {
      const mockCategory = createMockCategory().withDbId(123);
      const updatedCategory = mockCategory.withUpdatedProps({
        name: 'Updated',
      });

      const mockDbRepo: CategoryRepository = {
        update: mock(() => Promise.resolve(updatedCategory)),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        update: mock(() => Promise.resolve(updatedCategory)),
      } as unknown as CategoryRepository;

      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        createMockLogger(),
      );

      const result = await repo.update(mockCategory);

      expect(result).toBe(updatedCategory);
      expect(mockDbRepo.update).toHaveBeenCalledWith(mockCategory);
      // Note: DualWriteCategoryRepository.update only calls DB repo, not spreadsheet
      expect(mockSpreadsheetRepo.update).not.toHaveBeenCalled();
    });

    test('should handle non-Error objects in spreadsheet failures', async () => {
      const mockCategory = createMockCategory();
      const mockDbRepo: CategoryRepository = {
        save: mock(() => Promise.resolve()),
      } as unknown as CategoryRepository;

      const mockSpreadsheetRepo: CategoryRepository = {
        save: mock(() => Promise.reject('String error')),
      } as unknown as CategoryRepository;

      const mockLogger = createMockLogger();
      const repo = new DualWriteCategoryRepository(
        mockDbRepo,
        mockSpreadsheetRepo,
        mockLogger,
      );

      await expect(repo.save(mockCategory)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spreadsheet mirror write failed',
        { error: 'String error' },
      );
    });
  });
});
