/**
 * Domain-specific errors for business rule violations.
 *
 * These errors represent domain-level problems that occur when
 * business rules cannot be satisfied or entities are not found.
 */

/**
 * Base class for all domain errors.
 * Provides consistent error structure across the domain layer.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when an account cannot be found by its identifier.
 */
export class AccountNotFoundError extends DomainError {
  constructor(
    public readonly identifier: string,
    public readonly identifierType: 'externalId' | 'id' | 'iban' = 'externalId',
  ) {
    super(`Account not found with ${identifierType}: ${identifier}`);
  }
}

/**
 * Thrown when a budget cannot be found by its identifier.
 */
export class BudgetNotFoundError extends DomainError {
  constructor(public readonly budgetId: number) {
    super(`Budget not found with id: ${budgetId}`);
  }
}

/**
 * Thrown when attempting to create a budget with a name that already exists.
 */
export class BudgetNameTakenError extends DomainError {
  constructor(public readonly budgetName: string) {
    super(`Budget with name "${budgetName}" already exists`);
  }
}

/**
 * Thrown when a category cannot be found by its identifier.
 */
export class CategoryNotFoundError extends DomainError {
  constructor(public readonly categoryId: number) {
    super(`Category not found with id: ${categoryId}`);
  }
}

/**
 * Thrown when attempting to create a category with a name that already exists.
 */
export class CategoryNameTakenError extends DomainError {
  constructor(public readonly categoryName: string) {
    super(`Category with name "${categoryName}" already exists`);
  }
}

/**
 * Thrown when a parent category referenced by name does not exist.
 */
export class ParentCategoryNotFoundError extends DomainError {
  constructor(public readonly parentName: string) {
    super(`Parent category "${parentName}" not found`);
  }
}

/**
 * Thrown when an allocation cannot be found by its identifier.
 */
export class AllocationNotFoundError extends DomainError {
  constructor(public readonly allocationId: number) {
    super(`Allocation not found with id: ${allocationId}`);
  }
}

/**
 * Thrown when an external service (bank gateway, API) enforces rate limiting.
 * Use this in the application layer for retry logic.
 */
export class RateLimitError extends DomainError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
  }
}
