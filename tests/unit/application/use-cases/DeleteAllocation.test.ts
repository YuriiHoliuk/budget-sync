import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { DeleteAllocationUseCase } from '@application/use-cases/DeleteAllocation.ts';
import { AllocationNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import {
  createMockAllocationRepository,
  createTestAllocation,
} from '../../helpers';

describe('DeleteAllocationUseCase', () => {
  let mockAllocationRepository: AllocationRepository;
  let useCase: DeleteAllocationUseCase;

  beforeEach(() => {
    const existingAllocation = createTestAllocation({ dbId: 1 });
    mockAllocationRepository = createMockAllocationRepository({
      findById: mock(() => Promise.resolve(existingAllocation)),
    });
    useCase = new DeleteAllocationUseCase(mockAllocationRepository);
  });

  test('should delete an existing allocation', async () => {
    await useCase.execute({ id: 1 });

    expect(mockAllocationRepository.delete).toHaveBeenCalledTimes(1);
    expect(mockAllocationRepository.delete).toHaveBeenCalledWith(1);
  });

  test('should throw AllocationNotFoundError when allocation does not exist', async () => {
    mockAllocationRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      AllocationNotFoundError,
    );
    expect(mockAllocationRepository.delete).not.toHaveBeenCalled();
  });
});
