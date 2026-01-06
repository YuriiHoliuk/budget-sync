/**
 * WebhookController - Handles Monobank webhook HTTP requests
 *
 * Endpoints:
 * - GET /webhook - Validation endpoint (Monobank sends this to verify the URL)
 * - POST /webhook - Receives transaction notifications
 * - GET /health - Health check for Cloud Run
 *
 * Critical: POST /webhook always returns 200 to prevent Monobank
 * from disabling the webhook, even if processing fails internally.
 */

import type { EnqueueWebhookTransactionUseCase } from '@application/use-cases/EnqueueWebhookTransaction.ts';
import {
  type HttpRequest,
  type HttpResponse,
  type HttpServer,
  ok,
} from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { inject, injectable } from 'tsyringe';

/**
 * Controller for handling Monobank webhook endpoints.
 *
 * This controller is responsible for:
 * - Validating webhook URLs (GET /webhook)
 * - Receiving and enqueuing transaction notifications (POST /webhook)
 * - Health checks for Cloud Run (GET /health)
 */
@injectable()
export class WebhookController {
  constructor(
    private enqueueWebhookTransaction: EnqueueWebhookTransactionUseCase,
    @inject(LOGGER_TOKEN) private logger: Logger,
  ) {}

  /**
   * Register all webhook routes on the given HTTP server.
   */
  registerRoutes(server: HttpServer): void {
    server.get('/webhook', () => this.handleValidation());
    server.post('/webhook', (request) => this.handleWebhook(request));
    server.get('/health', () => this.handleHealthCheck());
  }

  /**
   * Handle GET /webhook - Monobank validation endpoint.
   * Returns 200 OK to confirm the webhook URL is valid.
   */
  private handleValidation(): HttpResponse {
    this.logger.info('Webhook validation request received');
    return ok();
  }

  /**
   * Handle POST /webhook - Receive transaction notification.
   * Always returns 200 to prevent Monobank from disabling the webhook.
   */
  private async handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    try {
      await this.processWebhookPayload(request.body);
    } catch (error) {
      this.logWebhookError(error);
    }

    // Always return 200 to prevent Monobank from disabling the webhook
    return ok();
  }

  /**
   * Process the webhook payload by enqueuing it for async processing.
   */
  private async processWebhookPayload(payload: unknown): Promise<void> {
    this.logger.debug('webhook', 'Received webhook payload', {
      payload: this.truncatePayloadForLogging(payload),
    });

    const result = await this.enqueueWebhookTransaction.execute(payload);

    this.logger.info('Webhook transaction enqueued', {
      messageId: result.messageId,
    });
  }

  /**
   * Log webhook processing errors without throwing.
   * Errors are logged but not returned to prevent Monobank from disabling the webhook.
   */
  private logWebhookError(error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.logger.error('Failed to process webhook', {
      error: errorMessage,
      stack: errorStack,
    });
  }

  /**
   * Truncate payload for logging to avoid excessive log sizes.
   */
  private truncatePayloadForLogging(payload: unknown): unknown {
    if (payload === null || payload === undefined) {
      return payload;
    }

    const payloadString = JSON.stringify(payload);
    const maxLength = 1000;

    if (payloadString.length > maxLength) {
      return `${payloadString.slice(0, maxLength)}... [truncated]`;
    }

    return payload;
  }

  /**
   * Handle GET /health - Health check endpoint for Cloud Run.
   */
  private handleHealthCheck(): HttpResponse {
    return ok({ status: 'healthy' });
  }
}
