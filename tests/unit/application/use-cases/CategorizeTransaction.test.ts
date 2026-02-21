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
  BudgetAssignmentResult,
  CategoryAssignmentRequest,
  CategoryAssignmentResult,
  LLMGateway,
} from '@domain/gateways/LLMGateway.ts';
import type { BudgetizationRuleRepository } from '@domain/repositories/BudgetizationRuleRepository.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import type { CategoryRepository } from '@domain/repositories/CategoryRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import {
  CategorizationStatus,
  CategoryStatus,
  TransactionType,
} from '@domain/value-objects/index.ts';
import { Money } from '@domain/value-objects/Money.ts';
import {
  createMockBudgetizationRuleRepository,
  createMockBudgetRepository,
  createMockCategorizationRuleRepository,
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
    cadenceUnit: null,
    cadenceCount: null,
    targetDate: null,
    startDate: overrides.startDate ?? new Date('2026-01-01'),
    endDate: overrides.endDate ?? new Date('2026-12-31'),
    isArchived: false,
    cap: null,
    sortOrder: null,
    budgetGroupId: null,
  });
}

describe('CategorizeTransactionUseCase', () => {
  let transactionRepository: TransactionRepository;
  let categoryRepository: CategoryRepository;
  let budgetRepository: BudgetRepository;
  let categorizationRuleRepository: CategorizationRuleRepository;
  let budgetizationRuleRepository: BudgetizationRuleRepository;
  let llmGateway: LLMGateway;
  let useCase: CategorizeTransactionUseCase;

  beforeEach(() => {
    transactionRepository = createMockTransactionRepository();
    categoryRepository = createMockCategoryRepository();
    budgetRepository = createMockBudgetRepository();
    categorizationRuleRepository = createMockCategorizationRuleRepository();
    budgetizationRuleRepository = createMockBudgetizationRuleRepository();
    llmGateway = createMockLLMGateway();
    useCase = new CategorizeTransactionUseCase(
      transactionRepository,
      categoryRepository,
      budgetRepository,
      categorizationRuleRepository,
      budgetizationRuleRepository,
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
        dbId: 42,
      });

      const category = createTestCategory({
        name: 'Продукти',
        status: CategoryStatus.ACTIVE,
      });

      const budget = createTestBudget({
        name: 'Щоденні витрати',
      });

      const categoryResult: CategoryAssignmentResult = {
        category: 'Продукти',
        categoryReason: 'Grocery store purchase',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: 'Щоденні витрати',
        budgetReason: 'Regular daily expense',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([category]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([budget]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      const result = await useCase.execute({ transactionDbId: 42 });

      expect(result).toEqual({
        success: true,
        category: 'Продукти',
        budget: 'Щоденні витрати',
        isNewCategory: false,
      });

      expect(categoryRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        42,
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
        dbId: 43,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: 'Нова категорія',
        categoryReason: 'This is a new category suggestion',
        isNewCategory: true,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      const result = await useCase.execute({ transactionDbId: 43 });

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
        dbId: 44,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: null,
        categoryReason: 'Unable to determine category',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      const result = await useCase.execute({ transactionDbId: 44 });

      expect(result).toEqual({
        success: true,
        category: null,
        budget: null,
        isNewCategory: false,
      });

      expect(categoryRepository.save).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        44,
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
        dbId: 45,
      });

      const category = createTestCategory({
        name: 'Ресторани',
        status: CategoryStatus.ACTIVE,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: 'Ресторани',
        categoryReason: 'Restaurant expense',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: 'No matching budget found',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([category]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      const result = await useCase.execute({ transactionDbId: 45 });

      expect(result).toEqual({
        success: true,
        category: 'Ресторани',
        budget: null,
        isNewCategory: false,
      });

      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        45,
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
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(null);

      await expect(useCase.execute({ transactionDbId: 999 })).rejects.toThrow(
        TransactionNotFoundError,
      );

      await expect(useCase.execute({ transactionDbId: 999 })).rejects.toThrow(
        'Transaction not found with dbId: 999',
      );

      expect(llmGateway.assignCategory).not.toHaveBeenCalled();
      expect(llmGateway.assignBudget).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).not.toHaveBeenCalled();
    });

    test('should call LLM gateway with correct category hierarchy (fullPath)', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-hierarchy',
        description: 'Metro supermarket',
        amount: Money.create(-15000, Currency.UAH),
        mcc: 5411,
        counterpartyName: 'Metro',
        dbId: 46,
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

      const categoryResult: CategoryAssignmentResult = {
        category: 'Продукти',
        categoryReason: 'Grocery purchase',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: 'Харчування',
        budgetReason: 'Food related expense',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([parentCategory, childCategory]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([budget]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 46 });

      expect(llmGateway.assignCategory).toHaveBeenCalledTimes(1);

      const assignCategoryCall = (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0] as CategoryAssignmentRequest;

      // Verify availableCategories contains parent for hierarchy
      expect(assignCategoryCall.availableCategories).toEqual([
        { name: 'Їжа', parent: undefined },
        { name: 'Продукти', parent: 'Їжа' },
      ]);

      // Verify transaction context
      expect(assignCategoryCall.transaction).toEqual({
        description: 'Metro supermarket',
        amount: -150, // toMajorUnits() -> -15000 / 100
        currency: 'UAH',
        date: transaction.date,
        counterpartyName: 'Metro',
        mcc: 5411,
        bankCategory: undefined,
      });

      // Verify assignBudget was called with the assigned category
      expect(llmGateway.assignBudget).toHaveBeenCalledTimes(1);
      const assignBudgetCall = (
        llmGateway.assignBudget as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0];

      expect(assignBudgetCall.availableBudgets).toEqual(['Харчування']);
      expect(assignBudgetCall.assignedCategory).toBe('Продукти');
    });

    test('should load budgets active on transaction date', async () => {
      const transactionDate = new Date('2026-06-15');
      const transaction = createTestTransaction({
        externalId: 'tx-date',
        date: transactionDate,
        dbId: 47,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: null,
        categoryReason: null,
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 47 });

      expect(budgetRepository.findActive).toHaveBeenCalledWith(transactionDate);
    });

    test('should not save new category when isNewCategory is true but category is null', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-edge-case',
        dbId: 48,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: null,
        categoryReason: null,
        isNewCategory: true, // Edge case: isNewCategory true but category null
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 48 });

      expect(categoryRepository.save).not.toHaveBeenCalled();
    });

    test('should pass custom category rules to LLM assignCategory when rules exist', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-with-rules',
        description: 'ATB supermarket',
        dbId: 49,
      });

      const customCategoryRules = [
        'ATB should always be categorized as Продукти',
      ];

      const categoryResult: CategoryAssignmentResult = {
        category: 'Продукти',
        categoryReason: 'Matched custom rule for ATB',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: 'Щоденні витрати',
        budgetReason: 'Matched custom rule for supermarkets',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        categorizationRuleRepository.findAll as ReturnType<typeof bunMock>
      ).mockResolvedValue(customCategoryRules);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 49 });

      expect(llmGateway.assignCategory).toHaveBeenCalledTimes(1);
      const assignCategoryCall = (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0] as CategoryAssignmentRequest;

      expect(assignCategoryCall.categoryRules).toEqual(customCategoryRules);
    });

    test('should pass custom budget rules to LLM assignBudget when rules exist', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-with-budget-rules',
        description: 'ATB supermarket',
        dbId: 50,
      });

      const customBudgetRules = [
        'Supermarkets belong to Щоденні витрати budget',
      ];

      const categoryResult: CategoryAssignmentResult = {
        category: 'Продукти',
        categoryReason: 'Grocery store',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: 'Щоденні витрати',
        budgetReason: 'Matched custom rule for supermarkets',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetizationRuleRepository.findAll as ReturnType<typeof bunMock>
      ).mockResolvedValue(customBudgetRules);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 50 });

      expect(llmGateway.assignBudget).toHaveBeenCalledTimes(1);
      const assignBudgetCall = (
        llmGateway.assignBudget as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0];

      expect(assignBudgetCall.budgetRules).toEqual(customBudgetRules);
    });

    test('should not pass categoryRules when no category rules exist', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-no-rules',
        description: 'Some merchant',
        dbId: 51,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: null,
        categoryReason: null,
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        categorizationRuleRepository.findAll as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetizationRuleRepository.findAll as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 51 });

      expect(llmGateway.assignCategory).toHaveBeenCalledTimes(1);
      const assignCategoryCall = (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0] as CategoryAssignmentRequest;

      expect(assignCategoryCall.categoryRules).toBeUndefined();

      const assignBudgetCall = (
        llmGateway.assignBudget as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0];

      expect(assignBudgetCall.budgetRules).toBeUndefined();
    });

    test('should pass assigned category to assignBudget call', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-category-context',
        description: 'Silpo grocery store',
        dbId: 52,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: 'Продукти',
        categoryReason: 'Grocery store',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: 'Щоденні витрати',
        budgetReason: 'Food expenses go to daily budget',
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 52 });

      expect(llmGateway.assignBudget).toHaveBeenCalledTimes(1);
      const assignBudgetCall = (
        llmGateway.assignBudget as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0];

      // Verify the assigned category is passed to budget assignment
      expect(assignBudgetCall.assignedCategory).toBe('Продукти');
    });

    test('should pass null assignedCategory to assignBudget when category is null', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-null-category',
        description: 'Unknown merchant',
        dbId: 53,
      });

      const categoryResult: CategoryAssignmentResult = {
        category: null,
        categoryReason: 'Unable to categorize',
        isNewCategory: false,
      };

      const budgetResult: BudgetAssignmentResult = {
        budget: null,
        budgetReason: null,
      };

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);
      (
        categoryRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        budgetRepository.findActive as ReturnType<typeof bunMock>
      ).mockResolvedValue([]);
      (
        llmGateway.assignCategory as ReturnType<typeof bunMock>
      ).mockResolvedValue(categoryResult);
      (llmGateway.assignBudget as ReturnType<typeof bunMock>).mockResolvedValue(
        budgetResult,
      );

      await useCase.execute({ transactionDbId: 53 });

      expect(llmGateway.assignBudget).toHaveBeenCalledTimes(1);
      const assignBudgetCall = (
        llmGateway.assignBudget as ReturnType<typeof bunMock>
      ).mock.calls[0]?.[0];

      expect(assignBudgetCall.assignedCategory).toBeNull();
    });

    test('should skip categorization for TRANSFER transactions', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-transfer',
        description: 'Transfer to savings',
        type: TransactionType.TRANSFER,
        dbId: 54,
      });

      (
        transactionRepository.findByDbId as ReturnType<typeof bunMock>
      ).mockResolvedValue(transaction);

      const result = await useCase.execute({ transactionDbId: 54 });

      expect(result).toEqual({
        success: true,
        category: null,
        budget: null,
        isNewCategory: false,
      });

      expect(llmGateway.assignCategory).not.toHaveBeenCalled();
      expect(llmGateway.assignBudget).not.toHaveBeenCalled();
      expect(transactionRepository.updateCategorization).not.toHaveBeenCalled();
    });
  });
});
