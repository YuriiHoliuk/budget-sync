/**
 * WebhookServer - HTTP server for Monobank webhook handling
 *
 * Configures and runs an HTTP server with webhook endpoints.
 * Designed for deployment as a Cloud Run Service.
 */

import { type HttpRequest, HttpServer } from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import type { DependencyContainer } from 'tsyringe';
import { inject, injectable } from 'tsyringe';
import { CONTROLLERS } from './controllers/index.ts';

/**
 * HTTP server for handling Monobank webhooks.
 *
 * This server is responsible for:
 * - Creating and configuring the HTTP server
 * - Resolving and registering all controllers from the registry
 * - Logging incoming requests
 * - Starting and stopping the server
 */
@injectable()
export class WebhookServer {
  private server: HttpServer | null = null;

  constructor(@inject(LOGGER_TOKEN) private logger: Logger) {}

  /**
   * Start the webhook server on the specified port.
   *
   * @param port - Port to listen on
   * @param container - DI container to resolve controllers from
   * @returns The underlying HTTP server instance
   */
  start(port: number, container: DependencyContainer): HttpServer {
    this.server = this.createServer();
    this.registerControllers(container);
    this.server.start({ port });

    this.logger.info(`Webhook server started on port ${port}`);

    return this.server;
  }

  /**
   * Resolve and register all controllers from the registry.
   */
  private registerControllers(container: DependencyContainer): void {
    if (!this.server) {
      return;
    }

    for (const ControllerClass of CONTROLLERS) {
      const controller = container.resolve(ControllerClass);
      controller.registerRoutes(this.server);
      this.logger.debug(
        'http',
        `Registered controller: ${controller.constructor.name}`,
      );
    }
  }

  /**
   * Stop the webhook server if running.
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
      this.logger.info('Webhook server stopped');
    }
  }

  /**
   * Check if the server is running.
   */
  isRunning(): boolean {
    return this.server?.isRunning() ?? false;
  }

  /**
   * Create and configure the HTTP server with logging.
   */
  private createServer(): HttpServer {
    return new HttpServer({
      onRequest: (request) => this.logRequest(request),
      onError: (error, rawRequest) => this.logError(error, rawRequest),
    });
  }

  /**
   * Log incoming requests.
   */
  private logRequest(request: HttpRequest): void {
    this.logger.debug('http', `${request.method} ${request.path}`);
  }

  /**
   * Log errors that occur during request processing.
   */
  private logError(error: Error, rawRequest: Request): void {
    const url = new URL(rawRequest.url);
    this.logger.error(`Request error: ${rawRequest.method} ${url.pathname}`, {
      error: error.message,
      stack: error.stack,
    });
  }
}
