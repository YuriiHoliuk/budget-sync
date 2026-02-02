import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type UpdateCategoryRequestDTO,
  UpdateCategoryUseCase,
} from '@application/use-cases/UpdateCategory.ts';
import {
  CategoryNameTakenError,
  CategoryNotFoundError,
  ParentCategoryNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import {
  createMockCategoryRepository,
  createTestCategory,
} from '../../helpers';

describe('UpdateCategoryUseCase', () => {
  let mockCategoryRepository: CategoryRepository;
  let useCase: UpdateCategoryUseCase;

  beforeEach(() => {
    mockCategoryRepository = createMockCategoryRepository();
    useCase = new UpdateCategoryUseCase(mockCategoryRepository);
  });

  test('should update category name', async () => {
    const existing = createTestCategory({ name: 'Old Name', dbId: 1 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    const request: UpdateCategoryRequestDTO = { id: 1, name: 'New Name' };
    const result = await useCase.execute(request);

    expect(result.name).toBe('New Name');
    expect(mockCategoryRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should throw CategoryNotFoundError when category does not exist', async () => {
    await expect(
      useCase.execute({ id: 999, name: 'Anything' }),
    ).rejects.toThrow(CategoryNotFoundError);
    expect(mockCategoryRepository.update).not.toHaveBeenCalled();
  });

  test('should throw CategoryNameTakenError when name is taken by another category', async () => {
    const existing = createTestCategory({ name: 'Original', dbId: 1 });
    const other = createTestCategory({ name: 'Taken', dbId: 2 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));
    mockCategoryRepository.findByName = mock((name: string) =>
      name === 'Taken' ? Promise.resolve(other) : Promise.resolve(null),
    );

    await expect(useCase.execute({ id: 1, name: 'Taken' })).rejects.toThrow(
      CategoryNameTakenError,
    );
  });

  test('should allow keeping the same name', async () => {
    const existing = createTestCategory({ name: 'Same Name', dbId: 1 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));
    mockCategoryRepository.findByName = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1, name: 'Same Name' });

    expect(result.name).toBe('Same Name');
    expect(mockCategoryRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update parent category', async () => {
    const existing = createTestCategory({ name: 'Child', dbId: 1 });
    const parentCategory = createTestCategory({ name: 'Parent', dbId: 2 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));
    mockCategoryRepository.findByName = mock((name: string) =>
      name === 'Parent'
        ? Promise.resolve(parentCategory)
        : Promise.resolve(null),
    );

    const result = await useCase.execute({ id: 1, parentName: 'Parent' });

    expect(result.parent).toBe('Parent');
  });

  test('should throw ParentCategoryNotFoundError when parent does not exist', async () => {
    const existing = createTestCategory({ name: 'Child', dbId: 1 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    await expect(
      useCase.execute({ id: 1, parentName: 'NonExistent' }),
    ).rejects.toThrow(ParentCategoryNotFoundError);
  });

  test('should remove parent when parentName is null', async () => {
    const existing = createTestCategory({
      name: 'Child',
      parent: 'OldParent',
      dbId: 1,
    });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1, parentName: null });

    expect(result.parent).toBeUndefined();
  });

  test('should update status', async () => {
    const existing = createTestCategory({ name: 'Category', dbId: 1 });
    mockCategoryRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1, status: 'suggested' });

    expect(result.status).toBe('suggested');
  });
});
