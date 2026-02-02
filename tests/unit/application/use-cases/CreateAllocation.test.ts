import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type CreateAllocationRequestDTO,
  CreateAllocationUseCase,
} from '@application/use-cases/CreateAllocation.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import {
  createMockAllocationRepository,
  createMockBudgetRepository,
  createTestBudget,
} from '../../helpers';

describe('CreateAllocationUseCase', () => {
  let mockAllocationRepository: AllocationRepository;
  let mockBudgetRepository: BudgetRepository;
  let useCase: CreateAllocationUseCase;

  const validRequest: CreateAllocationRequestDTO = {
    budgetId: 1,
    amount: 500000,
    currency: 'UAH',
    period: '2026-02',
    date: '2026-02-01',
    notes: 'Monthly allocation',
  };

  beforeEach(() => {
    const budget = createTestBudget({ dbId: 1 });
    mockBudgetRepository = createMockBudgetRepository({
      findById: mock(() => Promise.resolve(budget)),
    });
    mockAllocationRepository = createMockAllocationRepository();
    useCase = new CreateAllocationUseCase(
      mockAllocationRepository,
      mockBudgetRepository,
    );
  });

  test('should create an allocation and return it', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.budgetId).toBe(1);
    expect(result.amount.amount).toBe(500000);
    expect(result.amount.currency.code).toBe('UAH');
    expect(result.period).toBe('2026-02');
    expect(result.notes).toBe('Monthly allocation');
    expect(mockAllocationRepository.save).toHaveBeenCalledTimes(1);
  });

  test('should throw BudgetNotFoundError when budget does not exist', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute(validRequest)).rejects.toThrow(
      BudgetNotFoundError,
    );
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should create allocation with negative amount', async () => {
    const request: CreateAllocationRequestDTO = {
      ...validRequest,
      amount: -200000,
    };

    const result = await useCase.execute(request);

    expect(result.amount.amount).toBe(-200000);
    expect(result.amount.isNegative()).toBe(true);
  });

  test('should default date to today when not provided', async () => {
    const request: CreateAllocationRequestDTO = {
      ...validRequest,
      date: undefined,
    };

    const result = await useCase.execute(request);

    const today = new Date().toISOString().slice(0, 10);
    expect(result.date.toISOString().slice(0, 10)).toBe(today);
  });

  test('should create allocation with null notes', async () => {
    const request: CreateAllocationRequestDTO = {
      ...validRequest,
      notes: null,
    };

    const result = await useCase.execute(request);

    expect(result.notes).toBeNull();
  });
});
