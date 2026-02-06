/**
 * HTTP Module
 *
 * Provides a lightweight HTTP server wrapper for Bun's native HTTP.
 * Designed for simple use cases like webhook endpoints.
 *
 * Usage example:
 *
 * ```typescript
 * import {
 *   HttpServer,
 *   ok,
 *   badRequest,
 *   type HttpRequest,
 * } from '@modules/http';
 *
 * const server = new HttpServer({
 *   onRequest: (request) => {
 *     console.log(`${request.method} ${request.path}`);
 *   },
 * });
 *
 * // Register routes
 * server.get('/health', () => ok({ status: 'healthy' }));
 *
 * server.post('/webhook', async (request: HttpRequest<WebhookPayload>) => {
 *   if (!request.body) {
 *     return badRequest('Missing request body');
 *   }
 *   await processWebhook(request.body);
 *   return ok();
 * });
 *
 * // Start the server
 * server.start({ port: 8080 });
 * console.log(`Server listening on port ${server.getPort()}`);
 *
 * // Stop when done
 * server.stop();
 * ```
 */

// Errors
export {
  BadRequestError,
  HttpError,
  InternalServerError,
  JsonParseError,
  MethodNotAllowedError,
  NotFoundError,
} from './errors.ts';

// Server
export {
  // Response helpers
  badRequest,
  created,
  createHttpServer,
  HttpServer,
  type HttpServerOptions,
  jsonResponse,
  noContent,
  notFound,
  ok,
  serverError,
} from './HttpServer.ts';

// Types
export type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpServerConfig,
  Route,
  RouteHandler,
  ServerWebSocket,
  WebSocketHandler,
} from './types.ts';
