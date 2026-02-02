import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type UpdateAllocationRequestDTO,
  UpdateAllocationUseCase,
} from '@application/use-cases/UpdateAllocation.ts';
import {
  AllocationNotFoundError,
  BudgetNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import {
  createMockAllocationRepository,
  createMockBudgetRepository,
  createTestAllocation,
  createTestBudget,
} from '../../helpers';

describe('UpdateAllocationUseCase', () => {
  let mockAllocationRepository: AllocationRepository;
  let mockBudgetRepository: BudgetRepository;
  let useCase: UpdateAllocationUseCase;

  beforeEach(() => {
    const existingAllocation = createTestAllocation({ dbId: 1, budgetId: 1 });
    const budget = createTestBudget({ dbId: 1 });

    mockAllocationRepository = createMockAllocationRepository({
      findById: mock(() => Promise.resolve(existingAllocation)),
    });
    mockBudgetRepository = createMockBudgetRepository({
      findById: mock(() => Promise.resolve(budget)),
    });
    useCase = new UpdateAllocationUseCase(
      mockAllocationRepository,
      mockBudgetRepository,
    );
  });

  test('should update allocation amount', async () => {
    const request: UpdateAllocationRequestDTO = {
      id: 1,
      amount: 750000,
    };

    const result = await useCase.execute(request);

    expect(result.amount.amount).toBe(750000);
    expect(mockAllocationRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update allocation period', async () => {
    const request: UpdateAllocationRequestDTO = {
      id: 1,
      period: '2026-03',
    };

    const result = await useCase.execute(request);

    expect(result.period).toBe('2026-03');
  });

  test('should update allocation notes to null', async () => {
    const existingWithNotes = createTestAllocation({
      dbId: 1,
      notes: 'Original note',
    });
    mockAllocationRepository.findById = mock(() =>
      Promise.resolve(existingWithNotes),
    );

    const request: UpdateAllocationRequestDTO = {
      id: 1,
      notes: null,
    };

    const result = await useCase.execute(request);

    expect(result.notes).toBeNull();
  });

  test('should throw AllocationNotFoundError when allocation does not exist', async () => {
    mockAllocationRepository.findById = mock(() => Promise.resolve(null));

    const request: UpdateAllocationRequestDTO = {
      id: 999,
      amount: 100000,
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      AllocationNotFoundError,
    );
    expect(mockAllocationRepository.update).not.toHaveBeenCalled();
  });

  test('should throw BudgetNotFoundError when changing to non-existent budget', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    const request: UpdateAllocationRequestDTO = {
      id: 1,
      budgetId: 999,
    };

    await expect(useCase.execute(request)).rejects.toThrow(BudgetNotFoundError);
    expect(mockAllocationRepository.update).not.toHaveBeenCalled();
  });

  test('should update budget ID when budget exists', async () => {
    const newBudget = createTestBudget({ dbId: 2, name: 'New Budget' });
    mockBudgetRepository.findById = mock(() => Promise.resolve(newBudget));

    const request: UpdateAllocationRequestDTO = {
      id: 1,
      budgetId: 2,
    };

    const result = await useCase.execute(request);

    expect(result.budgetId).toBe(2);
  });
});
