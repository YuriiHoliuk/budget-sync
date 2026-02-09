import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type EqualizeAllocationsRequestDTO,
  EqualizeAllocationsUseCase,
} from '@application/use-cases/EqualizeAllocations.ts';
import { Allocation } from '@domain/entities/Allocation.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { AllocationRepository } from '@domain/repositories/AllocationRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import type { TransactionSummary } from '@domain/repositories/transaction-types.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import {
  createMockAccountRepository,
  createMockAllocationRepository,
  createMockBudgetRepository,
  createTestAccount,
  createTestBudget,
} from '../../helpers';

function createTestBudgetAllocation(
  budgetId: number,
  amount: number,
  period: string,
): Allocation {
  return Allocation.create({
    budgetId,
    amount: Money.create(amount, Currency.UAH),
    period,
    date: new Date(`${period}-01`),
    notes: null,
  });
}

function createTransactionSummary(
  overrides: Partial<TransactionSummary> = {},
): TransactionSummary {
  return {
    budgetId: null,
    amount: 0,
    type: 'debit',
    date: new Date('2026-01-15'),
    accountRole: 'operational',
    excludeFromCalculations: false,
    ...overrides,
  };
}

function createMockTransactionRepo(): TransactionRepository {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByExternalId: mock(() => Promise.resolve(null)),
    findByExternalIds: mock(() => Promise.resolve(new Map())),
    findByAccountId: mock(() => Promise.resolve([])),
    findAll: mock(() => Promise.resolve([])),
    save: mock(() => Promise.resolve()),
    saveAndReturn: mock(() => Promise.resolve()),
    update: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    saveMany: mock(() => Promise.resolve()),
    saveManyAndReturn: mock(() => Promise.resolve([])),
    updateMany: mock(() => Promise.resolve()),
    updateCategorization: mock(() => Promise.resolve()),
    findByCategorizationStatus: mock(() => Promise.resolve([])),
    findUncategorized: mock(() => Promise.resolve([])),
    findRecordById: mock(() => Promise.resolve(null)),
    findRecordsFiltered: mock(() => Promise.resolve([])),
    countFiltered: mock(() => Promise.resolve(0)),
    updateRecordCategory: mock(() => Promise.resolve(null)),
    updateRecordBudget: mock(() => Promise.resolve(null)),
    updateRecordStatus: mock(() => Promise.resolve(null)),
    findTransactionSummaries: mock(() => Promise.resolve([])),
  } as unknown as TransactionRepository;
}

describe('EqualizeAllocationsUseCase', () => {
  let mockAllocationRepository: AllocationRepository;
  let mockBudgetRepository: BudgetRepository;
  let mockTransactionRepository: TransactionRepository;
  let mockAccountRepository: AccountRepository;
  let useCase: EqualizeAllocationsUseCase;

  const validRequest: EqualizeAllocationsRequestDTO = {
    period: '2026-01',
    currency: 'UAH',
  };

  beforeEach(() => {
    const groceriesBudget = createTestBudget({
      dbId: 1,
      name: 'Groceries',
      type: 'spending',
    });
    const transportBudget = createTestBudget({
      dbId: 2,
      name: 'Transport',
      type: 'spending',
    });
    const savingsBudget = createTestBudget({
      dbId: 3,
      name: 'Emergency Fund',
      type: 'savings',
    });

    mockBudgetRepository = createMockBudgetRepository({
      findAll: mock(() =>
        Promise.resolve([groceriesBudget, transportBudget, savingsBudget]),
      ),
    });

    mockAllocationRepository = createMockAllocationRepository({
      findAll: mock(() => Promise.resolve([])),
    });

    const account = createTestAccount();
    mockAccountRepository = createMockAccountRepository({
      findAll: mock(() => Promise.resolve([account])),
    });

    mockTransactionRepository = createMockTransactionRepo();

    useCase = new EqualizeAllocationsUseCase(
      mockAllocationRepository,
      mockBudgetRepository,
      mockTransactionRepository,
      mockAccountRepository,
    );
  });

  test('should create no allocations when spending equals allocated', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.allocationsCreated).toBe(0);
    expect(result.adjustments).toEqual([]);
    expect(mockAllocationRepository.save).not.toHaveBeenCalled();
  });

  test('should create allocation when spending exceeds allocated', async () => {
    (
      mockTransactionRepository.findTransactionSummaries as ReturnType<
        typeof mock
      >
    ).mockImplementation(() =>
      Promise.resolve([
        createTransactionSummary({
          budgetId: 1,
          amount: 50000,
          type: 'debit',
        }),
      ]),
    );

    const result = await useCase.execute(validRequest);

    expect(result.allocationsCreated).toBe(1);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]?.budgetId).toBe(1);
    expect(result.adjustments[0]?.delta).toBe(50000);
    expect(mockAllocationRepository.save).toHaveBeenCalledTimes(1);

    const savedAllocation = (
      mockAllocationRepository.save as ReturnType<typeof mock>
    ).mock.calls[0]?.[0] as Allocation;
    expect(savedAllocation.amount.amount).toBe(50000);
    expect(savedAllocation.budgetId).toBe(1);
    expect(savedAllocation.period).toBe('2026-01');
  });

  test('should create negative allocation when allocated exceeds spending', async () => {
    (
      mockAllocationRepository.findAll as ReturnType<typeof mock>
    ).mockImplementation(() =>
      Promise.resolve([createTestBudgetAllocation(1, 80000, '2026-01')]),
    );

    const result = await useCase.execute(validRequest);

    expect(result.allocationsCreated).toBe(1);
    expect(result.adjustments[0]?.budgetId).toBe(1);
    expect(result.adjustments[0]?.delta).toBe(-80000);
  });

  test('should only equalize SPENDING-type budgets', async () => {
    (
      mockTransactionRepository.findTransactionSummaries as ReturnType<
        typeof mock
      >
    ).mockImplementation(() =>
      Promise.resolve([
        createTransactionSummary({
          budgetId: 1,
          amount: 30000,
          type: 'debit',
        }),
        createTransactionSummary({
          budgetId: 3,
          amount: 20000,
          type: 'debit',
        }),
      ]),
    );

    const result = await useCase.execute(validRequest);

    expect(result.allocationsCreated).toBe(1);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]?.budgetId).toBe(1);
  });

  test('should equalize only specified budgetIds', async () => {
    (
      mockTransactionRepository.findTransactionSummaries as ReturnType<
        typeof mock
      >
    ).mockImplementation(() =>
      Promise.resolve([
        createTransactionSummary({
          budgetId: 1,
          amount: 30000,
          type: 'debit',
        }),
        createTransactionSummary({
          budgetId: 2,
          amount: 20000,
          type: 'debit',
        }),
      ]),
    );

    const result = await useCase.execute({
      ...validRequest,
      budgetIds: [2],
    });

    expect(result.allocationsCreated).toBe(1);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]?.budgetId).toBe(2);
    expect(result.adjustments[0]?.delta).toBe(20000);
  });

  test('should set allocation date to last day of the period month', async () => {
    (
      mockTransactionRepository.findTransactionSummaries as ReturnType<
        typeof mock
      >
    ).mockImplementation(() =>
      Promise.resolve([
        createTransactionSummary({
          budgetId: 1,
          amount: 50000,
          type: 'debit',
        }),
      ]),
    );

    await useCase.execute(validRequest);

    const savedAllocation = (
      mockAllocationRepository.save as ReturnType<typeof mock>
    ).mock.calls[0]?.[0] as Allocation;
    expect(savedAllocation.date.getFullYear()).toBe(2026);
    expect(savedAllocation.date.getMonth()).toBe(0);
    expect(savedAllocation.date.getDate()).toBe(31);
  });

  test('should handle multiple budgets needing equalization', async () => {
    (
      mockTransactionRepository.findTransactionSummaries as ReturnType<
        typeof mock
      >
    ).mockImplementation(() =>
      Promise.resolve([
        createTransactionSummary({
          budgetId: 1,
          amount: 40000,
          type: 'debit',
        }),
        createTransactionSummary({
          budgetId: 2,
          amount: 15000,
          type: 'debit',
        }),
      ]),
    );

    const result = await useCase.execute(validRequest);

    expect(result.allocationsCreated).toBe(2);
    expect(result.adjustments).toHaveLength(2);
    expect(mockAllocationRepository.save).toHaveBeenCalledTimes(2);
  });
});
