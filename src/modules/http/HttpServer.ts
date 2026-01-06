/**
 * HttpServer - Lightweight HTTP server wrapper for Bun
 *
 * Provides simple routing and request/response handling.
 * This is a business-agnostic wrapper around Bun.serve().
 */

type BunServer = ReturnType<typeof Bun.serve>;

import { HttpError, JsonParseError, NotFoundError } from './errors.ts';
import type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpServerConfig,
  Route,
  RouteHandler,
} from './types.ts';

export interface HttpServerOptions {
  /** Handler called when an error occurs during request processing */
  onError?: (error: Error, request: Request) => HttpResponse | void;
  /** Handler called for each incoming request (for logging) */
  onRequest?: (request: HttpRequest) => void;
}

export class HttpServer {
  private routes: Route[] = [];
  private server: BunServer | null = null;
  private readonly options: HttpServerOptions;

  constructor(options: HttpServerOptions = {}) {
    this.options = options;
  }

  /**
   * Register a route handler
   */
  route(method: HttpMethod, path: string, handler: RouteHandler): this {
    this.routes.push({ method, path, handler });
    return this;
  }

  /**
   * Register a GET route
   */
  get(path: string, handler: RouteHandler): this {
    return this.route('GET', path, handler);
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: RouteHandler): this {
    return this.route('POST', path, handler);
  }

  /**
   * Register a PUT route
   */
  put(path: string, handler: RouteHandler): this {
    return this.route('PUT', path, handler);
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, handler: RouteHandler): this {
    return this.route('DELETE', path, handler);
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, handler: RouteHandler): this {
    return this.route('PATCH', path, handler);
  }

  /**
   * Start the server
   */
  start(config: HttpServerConfig): BunServer {
    const host = config.host ?? '0.0.0.0';

    this.server = Bun.serve({
      port: config.port,
      hostname: host,
      fetch: (request) => this.handleRequest(request),
    });

    return this.server;
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get the server port (only available after start)
   */
  getPort(): number | null {
    return this.server?.port ?? null;
  }

  /**
   * Handle an incoming request
   */
  private async handleRequest(rawRequest: Request): Promise<Response> {
    try {
      const httpRequest = await this.parseRequest(rawRequest);

      if (this.options.onRequest) {
        this.options.onRequest(httpRequest);
      }

      const httpResponse = await this.routeRequest(httpRequest);
      return this.buildResponse(httpResponse);
    } catch (error) {
      return this.handleError(error, rawRequest);
    }
  }

  /**
   * Parse the raw request into HttpRequest
   */
  private async parseRequest(rawRequest: Request): Promise<HttpRequest> {
    const url = new URL(rawRequest.url);
    const method = this.parseMethod(rawRequest.method);
    const body = await this.parseBody(rawRequest);

    return {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: rawRequest.headers,
      body,
      raw: rawRequest,
    };
  }

  /**
   * Parse HTTP method from string
   */
  private parseMethod(method: string): HttpMethod {
    const upperMethod = method.toUpperCase();
    if (this.isValidMethod(upperMethod)) {
      return upperMethod;
    }
    return 'GET';
  }

  /**
   * Check if a string is a valid HTTP method
   */
  private isValidMethod(method: string): method is HttpMethod {
    return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
  }

  /**
   * Parse request body as JSON if applicable
   */
  private async parseBody(request: Request): Promise<unknown | null> {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return null;
    }

    const text = await request.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      const errorMessage =
        parseError instanceof Error
          ? parseError.message
          : 'Unknown parse error';
      throw new JsonParseError(errorMessage);
    }
  }

  /**
   * Find and execute the matching route handler
   */
  private routeRequest(
    request: HttpRequest,
  ): Promise<HttpResponse> | HttpResponse {
    const matchingRoute = this.findRoute(request.method, request.path);

    if (!matchingRoute) {
      throw new NotFoundError(request.path, request.method);
    }

    return matchingRoute.handler(request);
  }

  /**
   * Find a route matching the method and path
   */
  private findRoute(method: HttpMethod, path: string): Route | undefined {
    return this.routes.find(
      (route) => route.method === method && route.path === path,
    );
  }

  /**
   * Build a Response from HttpResponse
   */
  private buildResponse(httpResponse: HttpResponse): Response {
    const headers = new Headers(httpResponse.headers);

    if (httpResponse.body !== undefined) {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      const bodyString =
        typeof httpResponse.body === 'string'
          ? httpResponse.body
          : JSON.stringify(httpResponse.body);

      return new Response(bodyString, {
        status: httpResponse.status,
        headers,
      });
    }

    return new Response(null, {
      status: httpResponse.status,
      headers,
    });
  }

  /**
   * Handle errors and convert to HTTP response
   */
  private handleError(error: unknown, rawRequest: Request): Response {
    const httpError =
      error instanceof HttpError ? error : this.wrapError(error);

    if (this.options.onError) {
      const customResponse = this.options.onError(httpError, rawRequest);
      if (customResponse) {
        return this.buildResponse(customResponse);
      }
    }

    return this.buildResponse({
      status: httpError.statusCode,
      body: { error: httpError.message },
    });
  }

  /**
   * Wrap unknown error into HttpError
   */
  private wrapError(error: unknown): HttpError {
    if (error instanceof Error) {
      return new HttpError(error.message, 500);
    }
    return new HttpError('Internal server error', 500);
  }
}

/**
 * Create a new HttpServer instance
 */
export function createHttpServer(options?: HttpServerOptions): HttpServer {
  return new HttpServer(options);
}

/**
 * Response helper - Create a JSON response
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
): HttpResponse {
  return {
    status,
    body: data,
  };
}

/**
 * Response helper - Create an OK response (200)
 */
export function ok(data?: unknown): HttpResponse {
  return jsonResponse(data ?? { ok: true }, 200);
}

/**
 * Response helper - Create a Created response (201)
 */
export function created(data?: unknown): HttpResponse {
  return jsonResponse(data ?? { created: true }, 201);
}

/**
 * Response helper - Create a No Content response (204)
 */
export function noContent(): HttpResponse {
  return { status: 204 };
}

/**
 * Response helper - Create a Bad Request response (400)
 */
export function badRequest(message: string = 'Bad request'): HttpResponse {
  return jsonResponse({ error: message }, 400);
}

/**
 * Response helper - Create a Not Found response (404)
 */
export function notFound(message: string = 'Not found'): HttpResponse {
  return jsonResponse({ error: message }, 404);
}

/**
 * Response helper - Create an Internal Server Error response (500)
 */
export function serverError(
  message: string = 'Internal server error',
): HttpResponse {
  return jsonResponse({ error: message }, 500);
}
