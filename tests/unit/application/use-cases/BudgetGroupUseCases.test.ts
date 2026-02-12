import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CreateBudgetGroupUseCase } from '@application/use-cases/CreateBudgetGroup.ts';
import { DeleteBudgetGroupUseCase } from '@application/use-cases/DeleteBudgetGroup.ts';
import { ReorderBudgetGroupUseCase } from '@application/use-cases/ReorderBudgetGroup.ts';
import { UpdateBudgetGroupUseCase } from '@application/use-cases/UpdateBudgetGroup.ts';
import type { BudgetGroup } from '@domain/entities/BudgetGroup.ts';
import {
  BudgetGroupNameEmptyError,
  BudgetGroupNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { BudgetGroupRepository } from '@domain/repositories/BudgetGroupRepository.ts';
import {
  createMockBudgetGroupRepository,
  createTestBudgetGroup,
} from '../../helpers/index.ts';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): BudgetGroup {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as BudgetGroup;
}

describe('CreateBudgetGroupUseCase', () => {
  let mockRepository: BudgetGroupRepository;
  let useCase: CreateBudgetGroupUseCase;

  beforeEach(() => {
    mockRepository = createMockBudgetGroupRepository();
    useCase = new CreateBudgetGroupUseCase(mockRepository);
  });

  test('should create a budget group with generated sortOrder', async () => {
    const result = await useCase.execute({ name: 'New Group' });

    expect(result.name).toBe('New Group');
    expect(result.sortOrder).toBeTruthy();
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  test('should throw error when name is empty', async () => {
    await expect(useCase.execute({ name: '' })).rejects.toThrow(
      BudgetGroupNameEmptyError,
    );
  });

  test('should throw error when name is whitespace only', async () => {
    await expect(useCase.execute({ name: '   ' })).rejects.toThrow(
      BudgetGroupNameEmptyError,
    );
  });

  test('should append new group after existing groups', async () => {
    const existingGroup = createTestBudgetGroup({
      dbId: 1,
      name: 'Existing',
      sortOrder: 'a0',
    });
    mockRepository.findAll = mock(() => Promise.resolve([existingGroup]));

    const result = await useCase.execute({ name: 'New Group' });

    // New sortOrder should be after 'a0'
    expect(result.sortOrder).toBeTruthy();
    const sortOrder = result.sortOrder ?? '';
    expect(sortOrder > 'a0').toBe(true);
  });
});

describe('UpdateBudgetGroupUseCase', () => {
  let mockRepository: BudgetGroupRepository;
  let useCase: UpdateBudgetGroupUseCase;

  beforeEach(() => {
    mockRepository = createMockBudgetGroupRepository();
    useCase = new UpdateBudgetGroupUseCase(mockRepository);
  });

  test('should update group name', async () => {
    const existingGroup = createTestBudgetGroup({ dbId: 1, name: 'Old Name' });
    mockRepository.findById = mock(() => Promise.resolve(existingGroup));

    const result = await useCase.execute({ id: 1, name: 'New Name' });

    expect(result.name).toBe('New Name');
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should throw error when group not found', async () => {
    mockRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999, name: 'Name' })).rejects.toThrow(
      BudgetGroupNotFoundError,
    );
  });

  test('should throw error when name is empty', async () => {
    const existingGroup = createTestBudgetGroup({ dbId: 1, name: 'Old Name' });
    mockRepository.findById = mock(() => Promise.resolve(existingGroup));

    await expect(useCase.execute({ id: 1, name: '' })).rejects.toThrow(
      BudgetGroupNameEmptyError,
    );
  });
});

describe('DeleteBudgetGroupUseCase', () => {
  let mockRepository: BudgetGroupRepository;
  let useCase: DeleteBudgetGroupUseCase;

  beforeEach(() => {
    mockRepository = createMockBudgetGroupRepository();
    useCase = new DeleteBudgetGroupUseCase(mockRepository);
  });

  test('should delete an existing group', async () => {
    const existingGroup = createTestBudgetGroup({ dbId: 1, name: 'To Delete' });
    mockRepository.findById = mock(() => Promise.resolve(existingGroup));

    const result = await useCase.execute({ id: 1 });

    expect(result).toBe(true);
    expect(mockRepository.delete).toHaveBeenCalledTimes(1);
  });

  test('should throw error when group not found', async () => {
    mockRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      BudgetGroupNotFoundError,
    );
  });
});

describe('ReorderBudgetGroupUseCase', () => {
  let mockRepository: BudgetGroupRepository;
  let useCase: ReorderBudgetGroupUseCase;

  beforeEach(() => {
    mockRepository = createMockBudgetGroupRepository();
    useCase = new ReorderBudgetGroupUseCase(mockRepository);
  });

  test('should throw error when group not found', async () => {
    mockRepository.findById = mock(() => Promise.resolve(null));

    await expect(
      useCase.execute({
        groupId: 999,
        afterGroupId: null,
        beforeGroupId: null,
      }),
    ).rejects.toThrow(BudgetGroupNotFoundError);
  });

  test('should throw error when afterGroupId not found', async () => {
    const group = createTestBudgetGroup({ dbId: 1, sortOrder: 'a0' });
    mockRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(group);
      }
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        groupId: 1,
        afterGroupId: 999,
        beforeGroupId: null,
      }),
    ).rejects.toThrow(BudgetGroupNotFoundError);
  });

  test('should throw error when beforeGroupId not found', async () => {
    const group = createTestBudgetGroup({ dbId: 1, sortOrder: 'a0' });
    mockRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(group);
      }
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        groupId: 1,
        afterGroupId: null,
        beforeGroupId: 999,
      }),
    ).rejects.toThrow(BudgetGroupNotFoundError);
  });

  test('should generate sortOrder when moving to beginning', async () => {
    const group = createTestBudgetGroup({ dbId: 1, sortOrder: 'a2' });
    const beforeGroup = createTestBudgetGroup({ dbId: 2, sortOrder: 'a0' });

    mockRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(group);
      }
      if (id === 2) {
        return Promise.resolve(beforeGroup);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      groupId: 1,
      afterGroupId: null,
      beforeGroupId: 2,
    });

    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    const updatedGroup = getFirstCallArg(
      mockRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be before 'a0'
    expect(updatedGroup.sortOrder).toBeTruthy();
    const sortOrder = updatedGroup.sortOrder ?? '';
    expect(sortOrder < 'a0').toBe(true);
  });

  test('should generate sortOrder when moving to end', async () => {
    const group = createTestBudgetGroup({ dbId: 1, sortOrder: 'a0' });
    const afterGroup = createTestBudgetGroup({ dbId: 2, sortOrder: 'a2' });

    mockRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(group);
      }
      if (id === 2) {
        return Promise.resolve(afterGroup);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      groupId: 1,
      afterGroupId: 2,
      beforeGroupId: null,
    });

    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    const updatedGroup = getFirstCallArg(
      mockRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be after 'a2'
    expect(updatedGroup.sortOrder).toBeTruthy();
    const sortOrder = updatedGroup.sortOrder ?? '';
    expect(sortOrder > 'a2').toBe(true);
  });

  test('should generate sortOrder when moving between two groups', async () => {
    const group = createTestBudgetGroup({ dbId: 1, sortOrder: 'a3' });
    const afterGroup = createTestBudgetGroup({ dbId: 2, sortOrder: 'a0' });
    const beforeGroup = createTestBudgetGroup({ dbId: 3, sortOrder: 'a2' });

    mockRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(group);
      }
      if (id === 2) {
        return Promise.resolve(afterGroup);
      }
      if (id === 3) {
        return Promise.resolve(beforeGroup);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      groupId: 1,
      afterGroupId: 2,
      beforeGroupId: 3,
    });

    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    const updatedGroup = getFirstCallArg(
      mockRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be between 'a0' and 'a2'
    expect(updatedGroup.sortOrder).toBeTruthy();
    const sortOrder = updatedGroup.sortOrder ?? '';
    expect(sortOrder > 'a0').toBe(true);
    expect(sortOrder < 'a2').toBe(true);
  });
});
