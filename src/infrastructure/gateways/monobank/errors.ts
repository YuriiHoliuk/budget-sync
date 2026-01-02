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

export class MonobankRateLimitError extends MonobankApiError {
  constructor(
    message: string = 'Rate limit exceeded. Please wait before making another request.',
  ) {
    super(message, 429);
    this.name = 'MonobankRateLimitError';
  }
}

export class MonobankAuthError extends MonobankApiError {
  constructor(message: string = 'Invalid or missing Monobank token') {
    super(message, 401);
    this.name = 'MonobankAuthError';
  }
}
