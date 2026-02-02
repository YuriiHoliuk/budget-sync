import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type MoveFundsRequestDTO,
  MoveFundsUseCase,
} from '@application/use-cases/MoveFunds.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import {
  createMockAllocationRepository,
  createMockBudgetRepository,
  createTestBudget,
} from '../../helpers';

describe('MoveFundsUseCase', () => {
  let mockAllocationRepository: AllocationRepository;
  let mockBudgetRepository: BudgetRepository;
  let useCase: MoveFundsUseCase;

  const validRequest: MoveFundsRequestDTO = {
    sourceBudgetId: 1,
    destBudgetId: 2,
    amount: 300000,
    currency: 'UAH',
    period: '2026-02',
    notes: 'Move to savings',
  };

  beforeEach(() => {
    const sourceBudget = createTestBudget({ dbId: 1, name: 'Groceries' });
    const destBudget = createTestBudget({ dbId: 2, name: 'Savings' });

    mockBudgetRepository = createMockBudgetRepository({
      findById: mock((id: number) => {
        if (id === 1) {
          return Promise.resolve(sourceBudget);
        }
        if (id === 2) {
          return Promise.resolve(destBudget);
        }
        return Promise.resolve(null);
      }),
    });
    mockAllocationRepository = createMockAllocationRepository();
    useCase = new MoveFundsUseCase(
      mockAllocationRepository,
      mockBudgetRepository,
    );
  });

  test('should create paired allocations with opposite signs', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.sourceAllocation.budgetId).toBe(1);
    expect(result.sourceAllocation.amount.amount).toBe(-300000);
    expect(result.sourceAllocation.amount.isNegative()).toBe(true);

    expect(result.destAllocation.budgetId).toBe(2);
    expect(result.destAllocation.amount.amount).toBe(300000);
    expect(result.destAllocation.amount.isPositive()).toBe(true);

    expect(mockAllocationRepository.save).toHaveBeenCalledTimes(2);
  });

  test('should set same period and date on both allocations', async () => {
    const result = await useCase.execute({
      ...validRequest,
      date: '2026-02-15',
    });

    expect(result.sourceAllocation.period).toBe('2026-02');
    expect(result.destAllocation.period).toBe('2026-02');
    expect(result.sourceAllocation.date.toISOString().slice(0, 10)).toBe(
      '2026-02-15',
    );
    expect(result.destAllocation.date.toISOString().slice(0, 10)).toBe(
      '2026-02-15',
    );
  });

  test('should throw when amount is zero', async () => {
    const request: MoveFundsRequestDTO = {
      ...validRequest,
      amount: 0,
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      'Move amount must be positive',
    );
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should throw when amount is negative', async () => {
    const request: MoveFundsRequestDTO = {
      ...validRequest,
      amount: -100000,
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      'Move amount must be positive',
    );
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should throw BudgetNotFoundError when source budget does not exist', async () => {
    mockBudgetRepository.findById = mock((id: number) => {
      if (id === 2) {
        return Promise.resolve(createTestBudget({ dbId: 2, name: 'Savings' }));
      }
      return Promise.resolve(null);
    });

    await expect(useCase.execute(validRequest)).rejects.toThrow(
      BudgetNotFoundError,
    );
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should throw BudgetNotFoundError when dest budget does not exist', async () => {
    mockBudgetRepository.findById = mock((id: number) => {
      if (id === 1) {
        return Promise.resolve(
          createTestBudget({ dbId: 1, name: 'Groceries' }),
        );
      }
      return Promise.resolve(null);
    });

    await expect(useCase.execute(validRequest)).rejects.toThrow(
      BudgetNotFoundError,
    );
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should set notes on both allocations', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.sourceAllocation.notes).toBe('Move to savings');
    expect(result.destAllocation.notes).toBe('Move to savings');
  });
});
