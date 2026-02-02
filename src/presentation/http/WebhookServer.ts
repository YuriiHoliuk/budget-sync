/**
 * WebhookServer - HTTP server for webhook handling and API
 *
 * Configures and runs an HTTP server with webhook endpoints and
 * optional additional route setup (e.g., GraphQL).
 * Designed for deployment as a Cloud Run Service.
 */

import { type HttpRequest, HttpServer } from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import type { DependencyContainer } from 'tsyringe';
import { inject, injectable } from 'tsyringe';
import { CONTROLLERS } from './controllers/index.ts';

/** Options for starting the server */
export interface WebhookServerStartOptions {
  port: number;
  container: DependencyContainer;
  /** Async hook called after controllers are registered but before server starts listening */
  beforeStart?: (server: HttpServer) => Promise<void>;
}

/**
 * HTTP server for handling webhooks and API endpoints.
 *
 * This server is responsible for:
 * - Creating and configuring the HTTP server
 * - Resolving and registering all controllers from the registry
 * - Running optional setup hooks (e.g., GraphQL registration)
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
   * @param portOrOptions - Port number or full options object
   * @param container - DI container (when using positional args)
   * @returns The underlying HTTP server instance
   */
  async start(
    portOrOptions: number | WebhookServerStartOptions,
    container?: DependencyContainer,
  ): Promise<HttpServer> {
    const options = this.resolveStartOptions(portOrOptions, container);

    this.server = this.createServer();
    this.registerControllers(options.container);

    if (options.beforeStart) {
      await options.beforeStart(this.server);
    }

    this.server.start({ port: options.port });

    this.logger.info(`Server started on port ${options.port}`);

    return this.server;
  }

  private resolveStartOptions(
    portOrOptions: number | WebhookServerStartOptions,
    container?: DependencyContainer,
  ): WebhookServerStartOptions {
    if (typeof portOrOptions === 'number') {
      if (!container) {
        throw new Error(
          'Container is required when using positional arguments',
        );
      }
      return { port: portOrOptions, container };
    }
    return portOrOptions;
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
