import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ArchiveBudgetUseCase } from '@application/use-cases/ArchiveBudget.ts';
import type { Allocation } from '@domain/entities/Allocation.ts';
import type { Budget } from '@domain/entities/Budget.ts';
import { BudgetNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionSummary } from '@domain/repositories/transaction-types.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import {
  createMockAllocationRepository,
  createMockBudgetRepository,
  createMockTransactionRepository,
  createTestAllocation,
  createTestBudget,
} from '../../helpers';

function getFirstCallArg(mockFn: ReturnType<typeof mock>): Budget {
  const firstCall = mockFn.mock.calls[0];
  if (!firstCall) {
    throw new Error('Mock was not called');
  }
  return firstCall[0] as Budget;
}

describe('ArchiveBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let mockAllocationRepository: AllocationRepository;
  let mockTransactionRepository: TransactionRepository;
  let useCase: ArchiveBudgetUseCase;

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    mockAllocationRepository = createMockAllocationRepository();
    mockTransactionRepository = createMockTransactionRepository();
    useCase = new ArchiveBudgetUseCase(
      mockBudgetRepository,
      mockAllocationRepository,
      mockTransactionRepository,
    );
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
      isArchived: false,
      dbId: 1,
    });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1 });

    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.name).toBe('My Budget');
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

  test('should create negative allocation and archive when budget has positive balance', async () => {
    const existing = createTestBudget({ isArchived: false, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    const allocation = createTestAllocation({
      budgetId: 1,
      amount: Money.create(50000, Currency.UAH),
    });
    mockAllocationRepository.findByBudgetId = mock(() =>
      Promise.resolve([allocation]),
    );

    const summaries: TransactionSummary[] = [
      {
        budgetId: 1,
        amount: 20000,
        type: 'debit',
        date: new Date(),
        accountRole: 'operational',
        isTransfer: false,
      },
    ];
    mockTransactionRepository.findTransactionSummaries = mock(() =>
      Promise.resolve(summaries),
    );

    await useCase.execute({ id: 1 });

    expect(mockAllocationRepository.save).toHaveBeenCalledTimes(1);
    const savedAllocation = (
      mockAllocationRepository.save as ReturnType<typeof mock>
    ).mock.calls[0]?.[0] as Allocation;
    expect(savedAllocation.amount.amount).toBe(-30000);
    expect(savedAllocation.budgetId).toBe(1);
    expect(savedAllocation.notes).toBe('Funds released on archive');

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.isArchived).toBe(true);
  });

  test('should archive without creating allocation when budget has zero balance', async () => {
    const existing = createTestBudget({ isArchived: false, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    const allocation = createTestAllocation({
      budgetId: 1,
      amount: Money.create(50000, Currency.UAH),
    });
    mockAllocationRepository.findByBudgetId = mock(() =>
      Promise.resolve([allocation]),
    );

    const summaries: TransactionSummary[] = [
      {
        budgetId: 1,
        amount: 50000,
        type: 'debit',
        date: new Date(),
        accountRole: 'operational',
        isTransfer: false,
      },
    ];
    mockTransactionRepository.findTransactionSummaries = mock(() =>
      Promise.resolve(summaries),
    );

    await useCase.execute({ id: 1 });

    expect(mockAllocationRepository.save).not.toHaveBeenCalled();

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.isArchived).toBe(true);
  });

  test('should archive without creating allocation when budget is overspent', async () => {
    const existing = createTestBudget({ isArchived: false, dbId: 1 });
    mockBudgetRepository.findById = mock(() => Promise.resolve(existing));

    const allocation = createTestAllocation({
      budgetId: 1,
      amount: Money.create(30000, Currency.UAH),
    });
    mockAllocationRepository.findByBudgetId = mock(() =>
      Promise.resolve([allocation]),
    );

    const summaries: TransactionSummary[] = [
      {
        budgetId: 1,
        amount: 50000,
        type: 'debit',
        date: new Date(),
        accountRole: 'operational',
        isTransfer: false,
      },
    ];
    mockTransactionRepository.findTransactionSummaries = mock(() =>
      Promise.resolve(summaries),
    );

    await useCase.execute({ id: 1 });

    expect(mockAllocationRepository.save).not.toHaveBeenCalled();

    expect(mockBudgetRepository.update).toHaveBeenCalledTimes(1);
    const archivedBudget = getFirstCallArg(
      mockBudgetRepository.update as ReturnType<typeof mock>,
    );
    expect(archivedBudget.isArchived).toBe(true);
  });
});
