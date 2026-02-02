import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ArchiveCategoryUseCase } from '@application/use-cases/ArchiveCategory.ts';
import { CategoryNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import {
  createMockCategoryRepository,
  createTestCategory,
} from '../../helpers';

describe('ArchiveCategoryUseCase', () => {
  let mockCategoryRepository: CategoryRepository;
  let useCase: ArchiveCategoryUseCase;

  beforeEach(() => {
    mockCategoryRepository = createMockCategoryRepository();
    useCase = new ArchiveCategoryUseCase(mockCategoryRepository);
  });

  test('should archive a category', async () => {
    const existing = createTestCategory({ name: 'Food', dbId: 1 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1 });

    expect(result.status).toBe('archived');
    expect(result.name).toBe('Food');
    expect(mockCategoryRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should throw CategoryNotFoundError when category does not exist', async () => {
    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      CategoryNotFoundError,
    );
    expect(mockCategoryRepository.update).not.toHaveBeenCalled();
  });

  test('should preserve category properties when archiving', async () => {
    const existing = createTestCategory({
      name: 'Food',
      parent: 'Expenses',
      dbId: 1,
    });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1 });

    expect(result.name).toBe('Food');
    expect(result.parent).toBe('Expenses');
    expect(result.status).toBe('archived');
  });
});
