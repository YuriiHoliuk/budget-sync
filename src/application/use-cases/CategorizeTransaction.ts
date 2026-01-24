import type { Budget } from '@domain/entities/Budget.ts';
import { Category } from '@domain/entities/Category.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import { DomainError } from '@domain/errors/DomainErrors.ts';
import type {
  CategorizationResult,
  LLMGateway,
  TransactionContext,
} from '@domain/gateways/LLMGateway.ts';
import { LLM_GATEWAY_TOKEN } from '@domain/gateways/LLMGateway.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
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
 * Use case for categorizing a transaction using LLM.
 *
 * This use case handles:
 * 1. Finding the transaction by external ID
 * 2. Loading active categories and budgets
 * 3. Calling the LLM gateway for categorization
 * 4. Saving new suggested categories if LLM proposes one
 * 5. Updating the transaction with categorization result
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
    const [categories, budgets] = await this.loadCategoriesAndBudgets(
      transaction.date,
    );

    const result = await this.categorizeWithLLM(
      transaction,
      categories,
      budgets,
    );
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

  private loadCategoriesAndBudgets(
    transactionDate: Date,
  ): Promise<[Category[], Budget[]]> {
    return Promise.all([
      this.categoryRepository.findActive(),
      this.budgetRepository.findActive(transactionDate),
    ]);
  }

  private categorizeWithLLM(
    transaction: Transaction,
    categories: Category[],
    budgets: Budget[],
  ): Promise<CategorizationResult> {
    return this.llmGateway.categorize({
      transaction: this.toTransactionContext(transaction),
      availableCategories: categories.map((category) => ({
        name: category.name,
        parent: category.parent,
      })),
      availableBudgets: budgets.map((budget) => budget.name),
    });
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
