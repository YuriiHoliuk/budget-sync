import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  BatchUpdateTransactionsUseCase,
  BudgetNotFoundError,
  CategoryNotFoundError,
  EmptyBatchIdsError,
  NoBatchFieldsError,
} from '@application/use-cases/BatchUpdateTransactions.ts';
import type { Category } from '@domain/entities/Category.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';

type BatchUpdatePatch = {
  categoryId?: number | null;
  setCategory?: boolean;
  budgetId?: number | null;
  setBudget?: boolean;
  verify?: boolean;
};

function createMocks() {
  const transactionRepository = {
    batchUpdate: mock((ids: number[], _patch: BatchUpdatePatch) =>
      Promise.resolve({ updatedCount: ids.length, transactionIds: ids }),
    ),
  } as unknown as TransactionRepository;

  const categoryRepository = {
    findById: mock(() => Promise.resolve(null as Category | null)),
  } as unknown as CategoryRepository;

  const budgetRepository = {
    findById: mock(() => Promise.resolve(null)),
  } as unknown as BudgetRepository;

  return { transactionRepository, categoryRepository, budgetRepository };
}

function makeCategoryStub(id: number): Category {
  // Minimal stub — use case only checks truthiness, not the Category shape.
  return { id, name: `cat-${id}` } as unknown as Category;
}

describe('BatchUpdateTransactionsUseCase', () => {
  let useCase: BatchUpdateTransactionsUseCase;
  let transactionRepository: TransactionRepository;
  let categoryRepository: CategoryRepository;
  let budgetRepository: BudgetRepository;

  beforeEach(() => {
    const mocks = createMocks();
    transactionRepository = mocks.transactionRepository;
    categoryRepository = mocks.categoryRepository;
    budgetRepository = mocks.budgetRepository;
    useCase = new BatchUpdateTransactionsUseCase(
      transactionRepository,
      categoryRepository,
      budgetRepository,
    );
  });

  test('happy path: setCategory only — calls repo once with category patch', async () => {
    const findById = categoryRepository.findById as ReturnType<typeof mock>;
    findById.mockImplementation((id: number) =>
      Promise.resolve(makeCategoryStub(id)),
    );

    const result = await useCase.execute({
      ids: [1, 2, 3],
      categoryId: 42,
      setCategory: true,
    });

    expect(result.updatedCount).toBe(3);
    expect(result.transactionIds).toEqual([1, 2, 3]);

    expect(transactionRepository.batchUpdate).toHaveBeenCalledTimes(1);
    expect(transactionRepository.batchUpdate).toHaveBeenCalledWith(
      [1, 2, 3],
      expect.objectContaining({
        categoryId: 42,
        setCategory: true,
      }),
    );
  });

  test('happy path: setBudget + verify — calls repo with combined patch', async () => {
    const findById = budgetRepository.findById as ReturnType<typeof mock>;
    findById.mockImplementation((id: number) =>
      Promise.resolve({ id, name: `budget-${id}` }),
    );

    await useCase.execute({
      ids: [10, 20],
      budgetId: 7,
      setBudget: true,
      verify: true,
    });

    expect(transactionRepository.batchUpdate).toHaveBeenCalledWith(
      [10, 20],
      expect.objectContaining({
        budgetId: 7,
        setBudget: true,
        verify: true,
      }),
    );
  });

  test('happy path: all three fields — passes each through to repo', async () => {
    const catFind = categoryRepository.findById as ReturnType<typeof mock>;
    catFind.mockImplementation((id: number) =>
      Promise.resolve(makeCategoryStub(id)),
    );
    const budFind = budgetRepository.findById as ReturnType<typeof mock>;
    budFind.mockImplementation((id: number) =>
      Promise.resolve({ id, name: `budget-${id}` }),
    );

    await useCase.execute({
      ids: [1],
      categoryId: 5,
      setCategory: true,
      budgetId: 9,
      setBudget: true,
      verify: true,
    });

    expect(transactionRepository.batchUpdate).toHaveBeenCalledWith(
      [1],
      expect.objectContaining({
        categoryId: 5,
        setCategory: true,
        budgetId: 9,
        setBudget: true,
        verify: true,
      }),
    );
  });

  test('throws EmptyBatchIdsError when ids is empty', async () => {
    await expect(
      useCase.execute({ ids: [], setCategory: true, categoryId: null }),
    ).rejects.toBeInstanceOf(EmptyBatchIdsError);
    expect(transactionRepository.batchUpdate).not.toHaveBeenCalled();
  });

  test('throws NoBatchFieldsError when no flag is set', async () => {
    await expect(useCase.execute({ ids: [1, 2] })).rejects.toBeInstanceOf(
      NoBatchFieldsError,
    );
    expect(transactionRepository.batchUpdate).not.toHaveBeenCalled();
  });

  test('rejects with CategoryNotFoundError when categoryId is unknown, repo not called', async () => {
    const findById = categoryRepository.findById as ReturnType<typeof mock>;
    findById.mockImplementation(() => Promise.resolve(null));

    await expect(
      useCase.execute({
        ids: [1],
        categoryId: 999,
        setCategory: true,
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);

    expect(transactionRepository.batchUpdate).not.toHaveBeenCalled();
  });

  test('rejects with BudgetNotFoundError when budgetId is unknown, repo not called', async () => {
    const findById = budgetRepository.findById as ReturnType<typeof mock>;
    findById.mockImplementation(() => Promise.resolve(null));

    await expect(
      useCase.execute({
        ids: [1],
        budgetId: 999,
        setBudget: true,
      }),
    ).rejects.toBeInstanceOf(BudgetNotFoundError);

    expect(transactionRepository.batchUpdate).not.toHaveBeenCalled();
  });

  test('setCategory with categoryId=null: skips lookup, applies clear', async () => {
    await useCase.execute({
      ids: [1, 2],
      categoryId: null,
      setCategory: true,
    });

    expect(categoryRepository.findById).not.toHaveBeenCalled();
    expect(transactionRepository.batchUpdate).toHaveBeenCalledWith(
      [1, 2],
      expect.objectContaining({
        categoryId: null,
        setCategory: true,
      }),
    );
  });
});
