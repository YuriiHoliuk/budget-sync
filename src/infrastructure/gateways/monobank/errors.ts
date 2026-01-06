import { RateLimitError } from '@domain/errors/DomainErrors.ts';

export class MonobankApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorDescription?: string,
  ) {
    super(message);
    this.name = 'MonobankApiError';
  }
}

/**
 * Monobank-specific rate limit error.
 * Extends domain RateLimitError so use cases can catch the generic type.
 */
export class MonobankRateLimitError extends RateLimitError {
  public readonly statusCode = 429;

  constructor(
    message: string = 'Rate limit exceeded. Please wait before making another request.',
  ) {
    super(message);
    this.name = 'MonobankRateLimitError';
  }
}

export class MonobankAuthError extends MonobankApiError {
  constructor(message: string = 'Invalid or missing Monobank token') {
    super(message, 401);
    this.name = 'MonobankAuthError';
  }
}
