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
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface BatchUpdateTransactionsRequestDTO {
  ids: number[];
  categoryId?: number | null;
  setCategory?: boolean;
  budgetId?: number | null;
  setBudget?: boolean;
  verify?: boolean;
}

export interface BatchUpdateTransactionsResponseDTO {
  updatedCount: number;
  transactionIds: number[];
}

export class EmptyBatchIdsError extends Error {
  constructor() {
    super('At least one transaction id is required');
    this.name = 'EmptyBatchIdsError';
  }
}

export class NoBatchFieldsError extends Error {
  constructor() {
    super('At least one of setCategory, setBudget, or verify must be provided');
    this.name = 'NoBatchFieldsError';
  }
}

export class CategoryNotFoundError extends Error {
  constructor(categoryId: number) {
    super(`Category not found with id: ${categoryId}`);
    this.name = 'CategoryNotFoundError';
  }
}

export class BudgetNotFoundError extends Error {
  constructor(budgetId: number) {
    super(`Budget not found with id: ${budgetId}`);
    this.name = 'BudgetNotFoundError';
  }
}

@injectable()
export class BatchUpdateTransactionsUseCase extends UseCase<
  BatchUpdateTransactionsRequestDTO,
  BatchUpdateTransactionsResponseDTO
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepository: CategoryRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(
    request: BatchUpdateTransactionsRequestDTO,
  ): Promise<BatchUpdateTransactionsResponseDTO> {
    this.validateShape(request);
    await this.validateReferences(request);

    const result = await this.transactionRepository.batchUpdate(request.ids, {
      categoryId: request.categoryId ?? null,
      setCategory: request.setCategory,
      budgetId: request.budgetId ?? null,
      setBudget: request.setBudget,
      verify: request.verify,
    });

    return {
      updatedCount: result.updatedCount,
      transactionIds: result.transactionIds,
    };
  }

  private validateShape(request: BatchUpdateTransactionsRequestDTO): void {
    if (request.ids.length === 0) {
      throw new EmptyBatchIdsError();
    }
    const hasAnyField =
      request.setCategory === true ||
      request.setBudget === true ||
      request.verify === true;
    if (!hasAnyField) {
      throw new NoBatchFieldsError();
    }
  }

  private async validateReferences(
    request: BatchUpdateTransactionsRequestDTO,
  ): Promise<void> {
    if (request.setCategory && request.categoryId != null) {
      const category = await this.categoryRepository.findById(
        request.categoryId,
      );
      if (!category) {
        throw new CategoryNotFoundError(request.categoryId);
      }
    }
    if (request.setBudget && request.budgetId != null) {
      const budget = await this.budgetRepository.findById(request.budgetId);
      if (!budget) {
        throw new BudgetNotFoundError(request.budgetId);
      }
    }
  }
}
