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
 * Thrown when an external service (bank gateway, API) enforces rate limiting.
 * Use this in the application layer for retry logic.
 */
export class RateLimitError extends DomainError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
  }
}
