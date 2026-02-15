import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { UpdateBudgetUseCase } from '@application/use-cases/UpdateBudget.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import type { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import {
  BudgetNameTakenError,
  BudgetNotFoundError,
  InvalidBudgetEndDateError,
} from '@domain/errors/DomainErrors.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { BudgetTargetRepository } from '@domain/repositories/BudgetTargetRepository.ts';
import { Money } from '@domain/value-objects/Money.ts';
import {
  createMockBudgetRepository,
  createMockBudgetTargetRepository,
  createTestBudget,
} from '../../helpers';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): Budget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as Budget;
}

function getFirstSaveTargetArg(mockFn: ReturnType<typeof mock>): BudgetTarget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as BudgetTarget;
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

describe('UpdateBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let mockBudgetTargetRepository: BudgetTargetRepository;
  let useCase: UpdateBudgetUseCase;

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    mockBudgetTargetRepository = createMockBudgetTargetRepository();
    useCase = new UpdateBudgetUseCase(
      mockBudgetRepository,
      mockBudgetTargetRepository,
    );
  });

  test('should throw BudgetNotFoundError when budget does not exist', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    await expect(
      useCase.execute({ id: 999, month: getCurrentMonth() }),
    ).rejects.toThrow(BudgetNotFoundError);
  });

  test('should update budget name', async () => {
    const existing = createTestBudget({ name: 'Old Name', dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));
    mockBudgetRepository.findByName = mock(() => Promise.resolve(null));

    await useCase.execute({
      id: 1,
      month: getCurrentMonth(),
      name: 'New Name',
    });

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

    await expect(
      useCase.execute({ id: 1, month: getCurrentMonth(), name: 'Budget B' }),
    ).rejects.toThrow(BudgetNameTakenError);
  });

  test('should allow keeping the same name (no conflict with self)', async () => {
    const existing = createTestBudget({ name: 'My Budget', dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));
    mockBudgetRepository.findByName = mock(() => Promise.resolve(existing));

    await useCase.execute({
      id: 1,
      month: getCurrentMonth(),
      name: 'My Budget',
    });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update target amount while keeping currency', async () => {
    const existing = createTestBudget({ dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({
      id: 1,
      month: getCurrentMonth(),
      targetAmount: 2000000,
    });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.amount.amount).toBe(2000000);
    expect(updatedBudget.amount.currency.code).toBe('UAH');
  });

  test('should preserve unchanged fields', async () => {
    const existing = createTestBudget({
      name: 'Unchanged',
      cadenceUnit: 'month',
      cadenceCount: 1,
      targetDate: new Date('2026-12-01'),
      dbId: 1,
    });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({
      id: 1,
      month: getCurrentMonth(),
      targetAmount: 5000000,
    });

    const updatedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(updatedBudget.name).toBe('Unchanged');
    // Cadence and targetDate should be preserved (read-only fields)
    expect(updatedBudget.cadenceUnit).toBe('month');
    expect(updatedBudget.targetDate).toEqual(new Date('2026-12-01'));
  });

  describe('cap updates', () => {
    test('should update cap', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({ id: 1, month: getCurrentMonth(), cap: 3000000 });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.cap?.amount).toBe(3000000);
    });

    test('should clear cap when set to null', async () => {
      const existing = createTestBudget({
        dbId: 1,
        cap: Money.create(500000, { code: 'UAH', equals: () => true } as never),
      });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({ id: 1, month: getCurrentMonth(), cap: null });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.cap).toBeNull();
    });
  });

  describe('endDate validation', () => {
    test('should update endDate to valid future date', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      const month = getCurrentMonth();
      const endDate = `${month}-15`;

      await useCase.execute({ id: 1, month, endDate });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.endDate).toEqual(new Date(endDate));
    });

    test('should clear endDate when set to null', async () => {
      const existing = createTestBudget({
        dbId: 1,
        endDate: new Date('2026-12-31'),
      });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({ id: 1, month: getCurrentMonth(), endDate: null });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.endDate).toBeNull();
    });

    test('should clear endDate when set to empty string', async () => {
      const existing = createTestBudget({
        dbId: 1,
        endDate: new Date('2026-12-31'),
      });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({ id: 1, month: getCurrentMonth(), endDate: '' });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.endDate).toBeNull();
    });

    test('should reject endDate before first day of previous month', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      const now = new Date();
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
      const pastEndDate = twoMonthsAgo.toISOString().split('T')[0];

      await expect(
        useCase.execute({
          id: 1,
          month: getCurrentMonth(),
          endDate: pastEndDate,
        }),
      ).rejects.toThrow(InvalidBudgetEndDateError);
    });

    test('should allow endDate in previous month', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      const now = new Date();
      const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const endDate = lastDayOfPrevMonth.toISOString().split('T')[0];

      await useCase.execute({
        id: 1,
        month: getCurrentMonth(),
        endDate,
      });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.endDate).toBeDefined();
    });

    test('should preserve endDate when undefined', async () => {
      const existingEndDate = new Date('2026-12-31');
      const existing = createTestBudget({
        dbId: 1,
        endDate: existingEndDate,
      });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({
        id: 1,
        month: getCurrentMonth(),
        name: 'Renamed',
      });

      const updatedBudget = getFirstCallArg(
        mockBudgetRepository.update as ReturnType<typeof mock>,
      );
      expect(updatedBudget.endDate).toEqual(existingEndDate);
    });
  });

  describe('target history', () => {
    test('should create target history entry when target amount changes', async () => {
      const existing = createTestBudget({
        amount: Money.create(1000000, {
          code: 'UAH',
          equals: () => true,
        } as never),
        dbId: 1,
      });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({
        id: 1,
        targetAmount: 2000000,
        month: '2026-03',
      });

      expect(mockBudgetTargetRepository.save).toHaveBeenCalledTimes(1);
      const savedTarget = getFirstSaveTargetArg(
        mockBudgetTargetRepository.save as ReturnType<typeof mock>,
      );
      expect(savedTarget.budgetId).toBe(1);
      expect(savedTarget.targetAmount.amount).toBe(2000000);
      expect(savedTarget.effectiveFrom).toBe('2026-03');
    });

    test('should not create target history entry when target amount is not changed', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({
        id: 1,
        month: getCurrentMonth(),
        name: 'Renamed Budget',
      });

      expect(mockBudgetTargetRepository.save).not.toHaveBeenCalled();
    });

    test('should not create target history entry when target amount is the same', async () => {
      const existing = createTestBudget({ dbId: 1 });
      mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

      await useCase.execute({
        id: 1,
        targetAmount: existing.amount.amount,
        month: '2026-03',
      });

      expect(mockBudgetTargetRepository.save).not.toHaveBeenCalled();
    });
  });
});
