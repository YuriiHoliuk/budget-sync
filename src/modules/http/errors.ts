/**
 * HTTP module errors
 */

/** Base error for all HTTP-related errors */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Error for bad requests (400) */
export class BadRequestError extends HttpError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
    this.name = 'BadRequestError';
  }
}

/** Error when request body is invalid JSON */
export class JsonParseError extends BadRequestError {
  constructor(public readonly parseError: string) {
    super(`Invalid JSON: ${parseError}`);
    this.name = 'JsonParseError';
  }
}

/** Error when route is not found (404) */
export class NotFoundError extends HttpError {
  constructor(
    public readonly path: string,
    public readonly method: string,
  ) {
    super(`Route not found: ${method} ${path}`, 404);
    this.name = 'NotFoundError';
  }
}

/** Error when method is not allowed (405) */
export class MethodNotAllowedError extends HttpError {
  constructor(
    public readonly path: string,
    public readonly method: string,
    public readonly allowedMethods: string[],
  ) {
    super(
      `Method ${method} not allowed for ${path}. Allowed: ${allowedMethods.join(', ')}`,
      405,
    );
    this.name = 'MethodNotAllowedError';
  }
}

/** Error for internal server errors (500) */
export class InternalServerError extends HttpError {
  public readonly originalError?: Error;

  constructor(
    message: string = 'Internal server error',
    originalError?: Error,
  ) {
    super(message, 500);
    this.name = 'InternalServerError';
    this.originalError = originalError;
  }
}
