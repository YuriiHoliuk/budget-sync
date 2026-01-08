/**
 * LLM module errors
 */

/** Base error for all LLM-related errors */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Error when LLM API returns an error */
export class LLMApiError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'LLMApiError';
  }
}

/** Error when rate limit is exceeded */
export class LLMRateLimitError extends LLMError {
  constructor(retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
    );
    this.name = 'LLMRateLimitError';
  }
}

/** Error when parsing LLM response fails */
export class LLMResponseParseError extends LLMError {
  constructor(
    public readonly rawResponse: string,
    cause: unknown,
  ) {
    super(`Failed to parse LLM response: ${cause}`);
    this.name = 'LLMResponseParseError';
  }
}
