/**
 * Controller - Base class for HTTP controllers
 *
 * Provides a standardized pattern for defining HTTP routes with:
 * - Route definitions as declarative metadata
 * - Optional path prefix for grouping routes
 * - Automatic route registration on HttpServer
 * - Global error handling per controller
 * - DI support via TSyringe
 */

import {
  type HttpRequest,
  type HttpResponse,
  type HttpServer,
  serverError,
} from '@modules/http/index.ts';
import type { Logger } from '@modules/logging/index.ts';

/** Supported HTTP methods for route definitions */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Route definition for controller routes */
export interface RouteDefinition {
  /** HTTP method */
  method: HttpMethod;
  /** Path pattern (will be prefixed with controller prefix if set) */
  path: string;
  /** Method name on the controller to call as handler */
  handler: string;
}

/** Handler method signature */
type HandlerMethod = (
  request: HttpRequest,
) => Promise<HttpResponse> | HttpResponse;

/**
 * Abstract base class for HTTP controllers.
 *
 * Subclasses must:
 * - Use @injectable() decorator
 * - Inject logger via @inject(LOGGER_TOKEN) in constructor
 * - Define `routes`: Array of route definitions
 *
 * Optionally override:
 * - `prefix`: Path prefix for all routes
 * - `handleError`: Custom error handling
 */
export abstract class Controller {
  protected abstract logger: Logger;

  /**
   * Route definitions for this controller.
   * Each route maps an HTTP method and path to a handler method.
   */
  abstract routes: RouteDefinition[];

  /**
   * Optional path prefix for all routes in this controller.
   * Example: '/webhook' will prefix all route paths with '/webhook'
   */
  prefix?: string;

  /**
   * Register all routes on the given HTTP server.
   * Called by the server during startup.
   */
  registerRoutes(server: HttpServer): void {
    for (const route of this.routes) {
      const fullPath = this.buildFullPath(route.path);
      const handler = this.getHandler(route.handler);
      const boundHandler = this.createBoundHandler(handler);

      server[route.method](fullPath, boundHandler);
    }
  }

  /**
   * Build the full path by combining prefix and route path.
   */
  private buildFullPath(path: string): string {
    if (!this.prefix) {
      return path;
    }
    return `${this.prefix}${path}`;
  }

  /**
   * Get the handler method from the controller instance.
   * Throws if the handler method doesn't exist.
   */
  private getHandler(handlerName: string): HandlerMethod {
    const handler = (this as unknown as Record<string, HandlerMethod>)[
      handlerName
    ];

    if (!handler) {
      throw new Error(
        `Handler "${handlerName}" not found on ${this.constructor.name}`,
      );
    }

    return handler;
  }

  /**
   * Create a bound handler that wraps the method with error handling.
   */
  private createBoundHandler(
    handler: HandlerMethod,
  ): (request: HttpRequest) => Promise<HttpResponse> {
    return async (request: HttpRequest): Promise<HttpResponse> => {
      try {
        return await handler.call(this, request);
      } catch (error) {
        return this.handleError(error, request);
      }
    };
  }

  /**
   * Global error handler for this controller.
   * Override in subclasses to customize error responses.
   *
   * @param error - The error that occurred
   * @param request - The HTTP request that caused the error
   * @returns HTTP response to send to the client
   */
  protected handleError(error: unknown, request: HttpRequest): HttpResponse {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Request failed: ${request.method} ${request.path}`, {
      error: message,
    });
    return serverError(message);
  }
}
