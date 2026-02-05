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
 * Thrown when a transaction cannot be found by its identifier.
 */
export class TransactionNotFoundError extends DomainError {
  constructor(public readonly transactionId: number | string) {
    super(`Transaction not found with id: ${transactionId}`);
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

/**
 * Thrown when attempting to update protected fields on a synced account.
 * Synced accounts (source = 'bank_sync') have protected fields that cannot be modified.
 */
export class ProtectedFieldUpdateError extends DomainError {
  constructor(
    public readonly fieldName: string,
    public readonly accountId: number,
  ) {
    super(
      `Cannot modify protected field "${fieldName}" on synced account (id: ${accountId})`,
    );
  }
}

/**
 * Thrown when attempting to create an account with a name that already exists.
 */
export class AccountNameTakenError extends DomainError {
  constructor(public readonly accountName: string) {
    super(`Account with name "${accountName}" already exists`);
  }
}

/**
 * Thrown when attempting to manually create a transaction on a synced account.
 * Synced accounts (source = 'bank_sync') can only receive transactions via bank sync.
 */
export class ManualTransactionNotAllowedError extends DomainError {
  constructor(public readonly accountId: number) {
    super(
      `Manual transactions are not allowed on synced accounts (id: ${accountId}). Only manual accounts support manually created transactions.`,
    );
  }
}
