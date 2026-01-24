import type { Budget } from '@domain/entities/Budget.ts';
import { Category } from '@domain/entities/Category.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import { DomainError } from '@domain/errors/DomainErrors.ts';
import type {
  BudgetAssignmentResult,
  CategorizationResult,
  CategoryAssignmentResult,
  LLMGateway,
  TransactionContext,
} from '@domain/gateways/LLMGateway.ts';
import { LLM_GATEWAY_TOKEN } from '@domain/gateways/LLMGateway.ts';
import {
  BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  type BudgetizationRuleRepository,
} from '@domain/repositories/BudgetizationRuleRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  type CategorizationRuleRepository,
} from '@domain/repositories/CategorizationRuleRepository.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import {
  CategorizationStatus,
  CategoryStatus,
} from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

/**
 * Thrown when a transaction cannot be found by its external ID.
 */
export class TransactionNotFoundError extends DomainError {
  constructor(public readonly externalId: string) {
    super(`Transaction not found with externalId: ${externalId}`);
  }
}

/**
 * Request DTO for categorizing a transaction.
 */
export interface CategorizeTransactionRequestDTO {
  transactionExternalId: string;
}

/**
 * Result DTO indicating the outcome of categorization.
 */
export interface CategorizeTransactionResultDTO {
  success: boolean;
  category: string | null;
  budget: string | null;
  isNewCategory: boolean;
}

/**
 * Data loaded for categorization (categories, budgets, and rules).
 */
interface CategorizationData {
  categories: Category[];
  budgets: Budget[];
  categoryRules: string[];
  budgetRules: string[];
}

/**
 * Use case for categorizing a transaction using LLM.
 *
 * This use case handles:
 * 1. Finding the transaction by external ID
 * 2. Loading active categories and budgets
 * 3. Calling the LLM gateway for category assignment
 * 4. Calling the LLM gateway for budget assignment (with category context)
 * 5. Saving new suggested categories if LLM proposes one
 * 6. Updating the transaction with categorization result
 */
@injectable()
export class CategorizeTransactionUseCase extends UseCase<
  CategorizeTransactionRequestDTO,
  CategorizeTransactionResultDTO
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private categoryRepository: CategoryRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    @inject(CATEGORIZATION_RULE_REPOSITORY_TOKEN)
    private categorizationRuleRepository: CategorizationRuleRepository,
    @inject(BUDGETIZATION_RULE_REPOSITORY_TOKEN)
    private budgetizationRuleRepository: BudgetizationRuleRepository,
    @inject(LLM_GATEWAY_TOKEN)
    private llmGateway: LLMGateway,
  ) {
    super();
  }

  async execute(
    request: CategorizeTransactionRequestDTO,
  ): Promise<CategorizeTransactionResultDTO> {
    const transaction = await this.findTransactionOrThrow(
      request.transactionExternalId,
    );
    const data = await this.loadCategorizationData(transaction.date);

    const result = await this.categorizeWithLLM(transaction, data);
    await this.saveCategorizationResult(transaction, result);

    return this.createResultDTO(result);
  }

  private async findTransactionOrThrow(
    externalId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.transactionRepository.findByExternalId(externalId);
    if (!transaction) {
      throw new TransactionNotFoundError(externalId);
    }
    return transaction;
  }

  private async loadCategorizationData(
    transactionDate: Date,
  ): Promise<CategorizationData> {
    const [categories, budgets, categoryRules, budgetRules] = await Promise.all(
      [
        this.categoryRepository.findActive(),
        this.budgetRepository.findActive(transactionDate),
        this.categorizationRuleRepository.findAll(),
        this.budgetizationRuleRepository.findAll(),
      ],
    );
    return { categories, budgets, categoryRules, budgetRules };
  }

  private async categorizeWithLLM(
    transaction: Transaction,
    data: CategorizationData,
  ): Promise<CategorizationResult> {
    const transactionContext = this.toTransactionContext(transaction);

    const categoryResult = await this.assignCategory(
      transactionContext,
      data.categories,
      data.categoryRules,
    );

    const budgetResult = await this.assignBudget(
      transactionContext,
      data.budgets,
      data.budgetRules,
      categoryResult.category,
    );

    return this.combineLLMResults(categoryResult, budgetResult);
  }

  private assignCategory(
    transactionContext: TransactionContext,
    categories: Category[],
    categoryRules: string[],
  ): Promise<CategoryAssignmentResult> {
    return this.llmGateway.assignCategory({
      transaction: transactionContext,
      availableCategories: categories.map((category) => ({
        name: category.name,
        parent: category.parent,
      })),
      categoryRules: categoryRules.length > 0 ? categoryRules : undefined,
    });
  }

  private assignBudget(
    transactionContext: TransactionContext,
    budgets: Budget[],
    budgetRules: string[],
    assignedCategory: string | null,
  ): Promise<BudgetAssignmentResult> {
    return this.llmGateway.assignBudget({
      transaction: transactionContext,
      availableBudgets: budgets.map((budget) => budget.name),
      budgetRules: budgetRules.length > 0 ? budgetRules : undefined,
      assignedCategory,
    });
  }

  private combineLLMResults(
    categoryResult: CategoryAssignmentResult,
    budgetResult: BudgetAssignmentResult,
  ): CategorizationResult {
    return {
      category: categoryResult.category,
      categoryReason: categoryResult.categoryReason,
      isNewCategory: categoryResult.isNewCategory,
      budget: budgetResult.budget,
      budgetReason: budgetResult.budgetReason,
    };
  }

  private toTransactionContext(transaction: Transaction): TransactionContext {
    return {
      description: transaction.description,
      amount: transaction.amount.toMajorUnits(),
      currency: transaction.amount.currency.code,
      date: transaction.date,
      counterpartyName: transaction.counterpartyName,
      mcc: transaction.mcc,
      bankCategory: undefined,
    };
  }

  private async saveCategorizationResult(
    transaction: Transaction,
    result: CategorizationResult,
  ): Promise<void> {
    if (result.isNewCategory && result.category) {
      await this.saveNewCategory(result.category);
    }

    await this.transactionRepository.updateCategorization(
      transaction.externalId,
      {
        category: result.category,
        budget: result.budget,
        categoryReason: result.categoryReason,
        budgetReason: result.budgetReason,
        status: CategorizationStatus.CATEGORIZED,
      },
    );
  }

  private async saveNewCategory(categoryName: string): Promise<void> {
    await this.categoryRepository.save(
      Category.create({
        name: categoryName,
        status: CategoryStatus.SUGGESTED,
      }),
    );
  }

  private createResultDTO(
    result: CategorizationResult,
  ): CategorizeTransactionResultDTO {
    return {
      success: true,
      category: result.category,
      budget: result.budget,
      isNewCategory: result.isNewCategory,
    };
  }
}
