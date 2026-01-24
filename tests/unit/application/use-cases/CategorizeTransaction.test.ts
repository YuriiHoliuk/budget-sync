import 'reflect-metadata';
import {
  beforeEach,
  type mock as bunMock,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  CategorizeTransactionUseCase,
  TransactionNotFoundError,
} from '@application/use-cases/CategorizeTransaction.ts';
import { Budget } from '@domain/entities/Budget.ts';
import { Category } from '@domain/entities/Category.ts';
import type {
  CategorizationRequest,
  CategorizationResult,
  LLMGateway,
} from '@domain/gateways/LLMGateway.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import {
  CategorizationStatus,
  CategoryStatus,
} from '@domain/value-objects/index.ts';
import { Money } from '@domain/value-objects/Money.ts';
import {
  createMockBudgetRepository,
  createMockCategoryRepository,
  createMockLLMGateway,
  createMockTransactionRepository,
  createTestTransaction,
} from '../../helpers';

/**
 * Creates a test Category entity with sensible defaults.
 */
function createTestCategory(
  overrides: Partial<{
    name: string;
    parent?: string;
    status: (typeof CategoryStatus)[keyof typeof CategoryStatus];
  }> = {},
): Category {
  return Category.create({
    name: overrides.name ?? 'Test Category',
    parent: overrides.parent,
    status: overrides.status ?? CategoryStatus.ACTIVE,
  });
}

/**
 * Creates a test Budget entity with sensible defaults.
 */
function createTestBudget(
  overrides: Partial<{
    name: string;
    amount: Money;
    startDate: Date;
    endDate: Date;
  }> = {},
): Budget {
  return Budget.create({
    name: overrides.name ?? 'Test Budget',
    amount: overrides.amount ?? Money.create(100000, Currency.UAH),
    startDate: overrides.startDate ?? new Date('2026-01-01'),
    endDate: overrides.endDate ?? new Date('2026-12-31'),
  });
}

describe('CategorizeTransactionUseCase', () => {
  let transactionRepository: TransactionRepository;
  let categoryRepository: CategoryRepository;
  let budgetRepository: BudgetRepository;
  let llmGateway: LLMGateway;
  let useCase: CategorizeTransactionUseCase;

  beforeEach(() => {
    transactionRepository = createMockTransactionRepository();
    categoryRepository = createMockCategoryRepository();
    budgetRepository = createMockBudgetRepository();
    llmGateway = createMockLLMGateway();
    useCase = new CategorizeTransactionUseCase(
      transactionRepository,
      categoryRepository,
      budgetRepository,
      llmGateway,
    );
  });

  describe('execute()', () => {
    test('should successfully categorize transaction with existing category', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-123',
        description: 'Silpo grocery store',
        amount: Money.create(-5000, Currency.UAH),
        mcc: 5411,
        counterpartyName: 'Silpo',
      });

      const category = createTestCategory({
        name: 'Продукти',
        status: CategoryStatus.ACTIVE,
      });

      const budget = createTestBudget({
        name: 'Щоденні витрати',
      });

      const llmResult: CategorizationResult = {
        category: 'Продукти',
        categoryReason: 'Grocery store purchase',
        budget: 'Щоденні витрати',
        budgetReason: 'Regular daily expense',
        isNewCategory: false,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([category]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([budget]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      const result = await useCase.execute({ transactionExternalId: 'tx-123' });

      expect(result).toEqual({
        success: true,
        category: 'Продукти',
        budget: 'Щоденні витрати',
        isNewCategory: false,
      });

      expect(categoryRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        'tx-123',
        {
          category: 'Продукти',
          budget: 'Щоденні витрати',
          categoryReason: 'Grocery store purchase',
          budgetReason: 'Regular daily expense',
          status: CategorizationStatus.CATEGORIZED,
        },
      );
    });

    test('should successfully categorize with new category and save to Categories sheet', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-456',
        description: 'Some new type of merchant',
      });

      const llmResult: CategorizationResult = {
        category: 'Нова категорія',
        categoryReason: 'This is a new category suggestion',
        budget: null,
        budgetReason: null,
        isNewCategory: true,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      const result = await useCase.execute({ transactionExternalId: 'tx-456' });

      expect(result).toEqual({
        success: true,
        category: 'Нова категорія',
        budget: null,
        isNewCategory: true,
      });

      expect(categoryRepository.save).toHaveBeenCalledTimes(1);
      const savedCategory = (
        categoryRepository.save as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0] as Category;
      expect(savedCategory.name).toBe('Нова категорія');
      expect(savedCategory.status).toBe(CategoryStatus.SUGGESTED);
    });

    test('should handle null category (uncertain)', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-789',
        description: 'Unclear transaction',
      });

      const llmResult: CategorizationResult = {
        category: null,
        categoryReason: 'Unable to determine category',
        budget: null,
        budgetReason: null,
        isNewCategory: false,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      const result = await useCase.execute({ transactionExternalId: 'tx-789' });

      expect(result).toEqual({
        success: true,
        category: null,
        budget: null,
        isNewCategory: false,
      });

      expect(categoryRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        'tx-789',
        {
          category: null,
          budget: null,
          categoryReason: 'Unable to determine category',
          budgetReason: null,
          status: CategorizationStatus.CATEGORIZED,
        },
      );
    });

    test('should handle null budget (optional)', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-001',
        description: 'Restaurant',
      });

      const category = createTestCategory({
        name: 'Ресторани',
        status: CategoryStatus.ACTIVE,
      });

      const llmResult: CategorizationResult = {
        category: 'Ресторани',
        categoryReason: 'Restaurant expense',
        budget: null,
        budgetReason: 'No matching budget found',
        isNewCategory: false,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([category]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      const result = await useCase.execute({ transactionExternalId: 'tx-001' });

      expect(result).toEqual({
        success: true,
        category: 'Ресторани',
        budget: null,
        isNewCategory: false,
      });

      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        'tx-001',
        {
          category: 'Ресторани',
          budget: null,
          categoryReason: 'Restaurant expense',
          budgetReason: 'No matching budget found',
          status: CategorizationStatus.CATEGORIZED,
        },
      );
    });

    test('should throw TransactionNotFoundError when transaction not found', async () => {
      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(null);

      await expect(
        useCase.execute({ transactionExternalId: 'non-existent-tx' }),
      ).rejects.toThrow(TransactionNotFoundError);

      await expect(
        useCase.execute({ transactionExternalId: 'non-existent-tx' }),
      ).rejects.toThrow(
        'Transaction not found with externalId: non-existent-tx',
      );

      expect(llmGateway.categorize).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).not.toHaveBeenCalled();
    });

    test('should call LLM gateway with correct category hierarchy (fullPath)', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-hierarchy',
        description: 'Metro supermarket',
        amount: Money.create(-15000, Currency.UAH),
        mcc: 5411,
        counterpartyName: 'Metro',
      });

      const parentCategory = createTestCategory({
        name: 'Їжа',
        status: CategoryStatus.ACTIVE,
      });

      const childCategory = createTestCategory({
        name: 'Продукти',
        parent: 'Їжа',
        status: CategoryStatus.ACTIVE,
      });

      const budget = createTestBudget({
        name: 'Харчування',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      });

      const llmResult: CategorizationResult = {
        category: 'Продукти',
        categoryReason: 'Grocery purchase',
        budget: 'Харчування',
        budgetReason: 'Food related expense',
        isNewCategory: false,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([parentCategory, childCategory]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([budget]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      await useCase.execute({ transactionExternalId: 'tx-hierarchy' });

      expect(llmGateway.categorize).toHaveBeenCalledTimes(1);

      const categorizeCall = (
        llmGateway.categorize as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0] as CategorizationRequest;

      // Verify availableCategories contains parent for hierarchy
      expect(categorizeCall.availableCategories).toEqual([
        { name: 'Їжа', parent: undefined },
        { name: 'Продукти', parent: 'Їжа' },
      ]);

      // Verify availableBudgets contains budget names
      expect(categorizeCall.availableBudgets).toEqual(['Харчування']);

      // Verify transaction context
      expect(categorizeCall.transaction).toEqual({
        description: 'Metro supermarket',
        amount: -150, // toMajorUnits() -> -15000 / 100
        currency: 'UAH',
        date: transaction.date,
        counterpartyName: 'Metro',
        mcc: 5411,
        bankCategory: undefined,
      });
    });

    test('should load budgets active on transaction date', async () => {
      const transactionDate = new Date('2026-06-15');
      const transaction = createTestTransaction({
        externalId: 'tx-date',
        date: transactionDate,
      });

      const llmResult: CategorizationResult = {
        category: null,
        categoryReason: null,
        budget: null,
        budgetReason: null,
        isNewCategory: false,
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      await useCase.execute({ transactionExternalId: 'tx-date' });

      expect(budgetRepository.findActive).toHaveBeenCalledWith(transactionDate);
    });

    test('should not save new category when isNewCategory is true but category is null', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-edge-case',
      });

      const llmResult: CategorizationResult = {
        category: null,
        categoryReason: null,
        budget: null,
        budgetReason: null,
        isNewCategory: true, // Edge case: isNewCategory true but category null
      };

      (
        transactionRepository.findByExternalId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (llmGateway.categorize as ReturnType<typeof bunMock>).mockResolvedValue(
        llmResult,
      );

      await useCase.execute({ transactionExternalId: 'tx-edge-case' });

      expect(categoryRepository.save).not.toHaveBeenCalled();
    });
  });
});
