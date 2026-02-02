import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ArchiveBudgetUseCase } from '@application/use-cases/ArchiveBudget.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import { createMockBudgetRepository, createTestBudget } from '../../helpers';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): Budget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as Budget;
}

describe('ArchiveBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let useCase: ArchiveBudgetUseCase;

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    useCase = new ArchiveBudgetUseCase(mockBudgetRepository);
  });

  test('should throw BudgetNotFoundError when budget does not exist', async () => {
    mockBudgetRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      BudgetNotFoundError,
    );
  });

  test('should archive an existing budget', async () => {
    const existing = createTestBudget({ isArchived: false, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1 });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.isArchived).toBe(true);
  });

  test('should preserve all other fields when archiving', async () => {
    const existing = createTestBudget({
      name: 'My Budget',
      type: 'savings',
      isArchived: false,
      dbId: 1,
    });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1 });

    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.name).toBe('My Budget');
    expect(archivedBudget.type).toBe('savings');
    expect(archivedBudget.isArchived).toBe(true);
  });

  test('should archive an already archived budget without error', async () => {
    const existing = createTestBudget({ isArchived: true, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1 });

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.isArchived).toBe(true);
  });
});
