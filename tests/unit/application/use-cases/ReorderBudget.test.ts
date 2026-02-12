import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ReorderBudgetUseCase } from '@application/use-cases/ReorderBudget.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import {
  createMockBudgetRepository,
  createTestBudget,
} from '../../helpers/index.ts';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): Budget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as Budget;
}

describe('ReorderBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let useCase: ReorderBudgetUseCase;

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    useCase = new ReorderBudgetUseCase(mockBudgetRepository);
  });

  test('should throw BudgetNotFoundError when budget does not exist', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    await expect(
      useCase.execute({
        budgetId: 999,
        afterBudgetId: null,
        beforeBudgetId: null,
      }),
    ).rejects.toThrow(BudgetNotFoundError);
  });

  test('should throw BudgetNotFoundError when afterBudgetId does not exist', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a0' });
    mockBudgetRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(budget);
      }
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        budgetId: 1,
        afterBudgetId: 999,
        beforeBudgetId: null,
      }),
    ).rejects.toThrow(BudgetNotFoundError);
  });

  test('should throw BudgetNotFoundError when beforeBudgetId does not exist', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a0' });
    mockBudgetRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(budget);
      }
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute({
        budgetId: 1,
        afterBudgetId: null,
        beforeBudgetId: 999,
      }),
    ).rejects.toThrow(BudgetNotFoundError);
  });

  test('should generate sortOrder when moving to beginning', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a2' });
    const beforeBudget = createTestBudget({ dbId: 2, sortOrder: 'a0' });

    mockBudgetRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(budget);
      }
      if (id === 2) {
        return Promise.resolve(beforeBudget);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      budgetId: 1,
      afterBudgetId: null,
      beforeBudgetId: 2,
    });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be before 'a0'
    expect(updatedBudget.sortOrder).toBeTruthy();
    const sortOrder = updatedBudget.sortOrder ?? '';
    expect(sortOrder < 'a0').toBe(true);
  });

  test('should generate sortOrder when moving to end', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a0' });
    const afterBudget = createTestBudget({ dbId: 2, sortOrder: 'a2' });

    mockBudgetRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(budget);
      }
      if (id === 2) {
        return Promise.resolve(afterBudget);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      budgetId: 1,
      afterBudgetId: 2,
      beforeBudgetId: null,
    });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be after 'a2'
    expect(updatedBudget.sortOrder).toBeTruthy();
    const sortOrder = updatedBudget.sortOrder ?? '';
    expect(sortOrder > 'a2').toBe(true);
  });

  test('should generate sortOrder when moving between two budgets', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a3' });
    const afterBudget = createTestBudget({ dbId: 2, sortOrder: 'a0' });
    const beforeBudget = createTestBudget({ dbId: 3, sortOrder: 'a2' });

    mockBudgetRepository.findById = mock((id) => {
      if (id === 1) {
        return Promise.resolve(budget);
      }
      if (id === 2) {
        return Promise.resolve(afterBudget);
      }
      if (id === 3) {
        return Promise.resolve(beforeBudget);
      }
      return Promise.resolve(null);
    });

    await useCase.execute({
      budgetId: 1,
      afterBudgetId: 2,
      beforeBudgetId: 3,
    });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be between 'a0' and 'a2'
    expect(updatedBudget.sortOrder).toBeTruthy();
    const sortOrder = updatedBudget.sortOrder ?? '';
    expect(sortOrder > 'a0').toBe(true);
    expect(sortOrder < 'a2').toBe(true);
  });

  test('should generate sortOrder when both bounds are null', async () => {
    const budget = createTestBudget({ dbId: 1, sortOrder: 'a0' });

    mockBudgetRepository.findById = mock(() => Promise.resolve(budget));

    await useCase.execute({
      budgetId: 1,
      afterBudgetId: null,
      beforeBudgetId: null,
    });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    // New sortOrder should be generated
    expect(updatedBudget.sortOrder).toBeTruthy();
  });
});
