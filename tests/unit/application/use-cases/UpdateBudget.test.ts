import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { UpdateBudgetUseCase } from '@application/use-cases/UpdateBudget.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import {
  BudgetNameTakenError,
  BudgetNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import { createMockBudgetRepository, createTestBudget } from '../../helpers';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): Budget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as Budget;
}

describe('UpdateBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let useCase: UpdateBudgetUseCase;

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    useCase = new UpdateBudgetUseCase(mockBudgetRepository);
  });

  test('should throw BudgetNotFoundError when budget does not exist', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      BudgetNotFoundError,
    );
  });

  test('should update budget name', async () => {
    const existing = createTestBudget({ name: 'Old Name', dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));
    mockBudgetRepository.findByName = mock(() => Promise.resolve(null));

    await useCase.execute({ id: 1, name: 'New Name' });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.name).toBe('New Name');
  });

  test('should throw BudgetNameTakenError when new name conflicts with another budget', async () => {
    const existing = createTestBudget({ name: 'Budget A', dbId: 1 });
    const conflicting = createTestBudget({ name: 'Budget B', dbId: 2 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));
    mockBudgetRepository.findByName = mock(() => Promise.resolve(conflicting));

    await expect(useCase.execute({ id: 1, name: 'Budget B' })).rejects.toThrow(
      BudgetNameTakenError,
    );
  });

  test('should allow keeping the same name (no conflict with self)', async () => {
    const existing = createTestBudget({ name: 'My Budget', dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));
    mockBudgetRepository.findByName = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, name: 'My Budget' });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update budget type', async () => {
    const existing = createTestBudget({ type: 'spending', dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, type: 'savings' });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.type).toBe('savings');
  });

  test('should update target amount while keeping currency', async () => {
    const existing = createTestBudget({ dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, targetAmount: 2000000 });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.amount.amount).toBe(2000000);
    expect(updatedBudget.amount.currency.code).toBe('UAH');
  });

  test('should update target date to a new value', async () => {
    const existing = createTestBudget({ targetDate: null, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, targetDate: '2026-12-31' });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.targetDate).toEqual(new Date('2026-12-31'));
  });

  test('should clear target date when set to null', async () => {
    const existing = createTestBudget({
      targetDate: new Date('2026-06-01'),
      dbId: 1,
    });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, targetDate: null });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.targetDate).toBeNull();
  });

  test('should preserve unchanged fields', async () => {
    const existing = createTestBudget({
      name: 'Unchanged',
      type: 'goal',
      targetCadence: 'monthly',
      dbId: 1,
    });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1, targetAmount: 5000000 });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.name).toBe('Unchanged');
    expect(updatedBudget.type).toBe('goal');
    expect(updatedBudget.targetCadence).toBe('monthly');
  });
});
