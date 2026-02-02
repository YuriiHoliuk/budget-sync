import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type CreateCategoryRequestDTO,
  CreateCategoryUseCase,
} from '@application/use-cases/CreateCategory.ts';
import {
  CategoryNameTakenError,
  ParentCategoryNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import {
  createMockCategoryRepository,
  createTestCategory,
} from '../../helpers';

describe('CreateCategoryUseCase', () => {
  let mockCategoryRepository: CategoryRepository;
  let useCase: CreateCategoryUseCase;

  const validRequest: CreateCategoryRequestDTO = {
    name: 'Supermarket',
    parentName: null,
  };

  beforeEach(() => {
    mockCategoryRepository = createMockCategoryRepository();
    useCase = new CreateCategoryUseCase(mockCategoryRepository);
  });

  test('should create a category and return it', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.name).toBe('Supermarket');
    expect(result.status).toBe('active');
    expect(result.parent).toBeUndefined();
    expect(mockCategoryRepository.saveAndReturn).toHaveBeenCalledTimes(1);
  });

  test('should throw CategoryNameTakenError when name already exists', async () => {
    const existing = createTestCategory({ name: 'Supermarket' });
    mockCategoryRepository.findByName = mock(() => Promise.resolve(existing));

    await expect(useCase.execute(validRequest)).rejects.toThrow(
      CategoryNameTakenError,
    );
    expect(mockCategoryRepository.saveAndReturn).not.toHaveBeenCalled();
  });

  test('should create a category with a parent', async () => {
    const parentCategory = createTestCategory({ name: 'Food', dbId: 1 });
    mockCategoryRepository.findByName = mock((name: string) =>
      name === 'Food' ? Promise.resolve(parentCategory) : Promise.resolve(null),
    );

    const result = await useCase.execute({
      name: 'Supermarket',
      parentName: 'Food',
    });

    expect(result.name).toBe('Supermarket');
    expect(result.parent).toBe('Food');
  });

  test('should throw ParentCategoryNotFoundError when parent does not exist', async () => {
    await expect(
      useCase.execute({ name: 'Supermarket', parentName: 'NonExistent' }),
    ).rejects.toThrow(ParentCategoryNotFoundError);
    expect(mockCategoryRepository.saveAndReturn).not.toHaveBeenCalled();
  });

  test('should create a category with suggested status', async () => {
    const result = await useCase.execute({
      name: 'New Category',
      status: 'SUGGESTED',
    });

    expect(result.name).toBe('New Category');
    expect(result.status).toBe('suggested');
  });

  test('should default to active status when not specified', async () => {
    const result = await useCase.execute({ name: 'Active Category' });

    expect(result.status).toBe('active');
  });
});
