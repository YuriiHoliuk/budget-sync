/**
 * WebhookController - Handles Monobank webhook HTTP requests
 *
 * Endpoints:
 * - GET /webhook - Validation endpoint (Monobank sends this to verify the URL)
 * - POST /webhook - Receives transaction notifications
 * - POST /webhook/process - Processes Pub/Sub push messages
 * - GET /health - Health check for Cloud Run
 *
 * Critical: POST /webhook always returns 200 to prevent Monobank
 * from disabling the webhook, even if processing fails internally.
 */

import {
  type QueuedWebhookTransactionDTO,
  queuedWebhookTransactionSchema,
} from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { EnqueueWebhookTransactionUseCase } from '@application/use-cases/EnqueueWebhookTransaction.ts';
import { ProcessIncomingTransactionUseCase } from '@application/use-cases/ProcessIncomingTransaction.ts';
import {
  badRequest,
  type HttpRequest,
  type HttpResponse,
  ok,
  serverError,
} from '@modules/http/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { inject, injectable } from 'tsyringe';
import { Controller, type RouteDefinition } from '../Controller.ts';
import { PubSubPushParser } from '../pubsub/index.ts';

/**
 * Controller for handling Monobank webhook endpoints.
 *
 * This controller is responsible for:
 * - Validating webhook URLs (GET /webhook)
 * - Receiving and enqueuing transaction notifications (POST /webhook)
 * - Processing Pub/Sub push messages (POST /webhook/process)
 * - Health checks for Cloud Run (GET /health)
 */
@injectable()
export class WebhookController extends Controller {
  override prefix = '/webhook';

  routes: RouteDefinition[] = [
    { method: 'get', path: '', handler: 'handleValidation' },
    { method: 'post', path: '', handler: 'handleWebhook' },
    { method: 'post', path: '/process', handler: 'handlePubSubPush' },
    { method: 'get', path: '/health', handler: 'handleHealthCheck' },
  ];

  private readonly pubSubParser = new PubSubPushParser();

  constructor(
    private enqueueWebhookTransaction: EnqueueWebhookTransactionUseCase,
    private processIncomingTransaction: ProcessIncomingTransactionUseCase,
    @inject(LOGGER_TOKEN) protected logger: Logger,
  ) {
    super();
  }

  /**
   * Handle GET /webhook - Monobank validation endpoint.
   * Returns 200 OK to confirm the webhook URL is valid.
   */
  handleValidation(): HttpResponse {
    this.logger.info('Webhook validation request received');
    return ok();
  }

  /**
   * Handle POST /webhook - Receive transaction notification.
   * Always returns 200 to prevent Monobank from disabling the webhook.
   */
  async handleWebhook(request: HttpRequest): Promise<HttpResponse> {
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
  handleHealthCheck(): HttpResponse {
    return ok({ status: 'healthy' });
  }

  /**
   * Handle POST /webhook/process - Process Pub/Sub push message.
   *
   * Response contract (controls Pub/Sub retry behavior):
   * - 200: Success or duplicate - acknowledge message (no retry)
   * - 400: Invalid format - acknowledge message (permanent error, no retry)
   * - 500: Transient error - Pub/Sub will retry with exponential backoff
   */
  async handlePubSubPush(request: HttpRequest): Promise<HttpResponse> {
    const parseResult = this.pubSubParser.parse(
      request.body,
      queuedWebhookTransactionSchema,
    );

    if (!parseResult.success) {
      return this.handlePubSubParseError(parseResult, request.body);
    }

    return await this.processTransaction(
      parseResult.data,
      parseResult.messageId,
    );
  }

  /**
   * Handle Pub/Sub parse errors with appropriate logging and response.
   */
  private handlePubSubParseError(
    result:
      | { error: 'invalid_envelope' }
      | { error: 'invalid_data'; messageId: string },
    body: unknown,
  ): HttpResponse {
    if (result.error === 'invalid_envelope') {
      this.logger.warn('Invalid Pub/Sub push message format', {
        body: this.truncatePayloadForLogging(body),
      });
      return badRequest('Invalid Pub/Sub push message format');
    }

    this.logger.warn('Failed to decode Pub/Sub message data', {
      messageId: result.messageId,
    });
    return badRequest('Invalid message data');
  }

  /**
   * Process the transaction and return appropriate HTTP response.
   */
  private async processTransaction(
    transactionData: QueuedWebhookTransactionDTO,
    messageId: string,
  ): Promise<HttpResponse> {
    try {
      const result =
        await this.processIncomingTransaction.execute(transactionData);

      this.logger.info('Pub/Sub message processed', {
        messageId,
        transactionExternalId: result.transactionExternalId,
        saved: result.saved,
      });

      return ok({ processed: true, saved: result.saved });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to process Pub/Sub message', {
        messageId,
        error: errorMessage,
      });

      // Return 500 to trigger Pub/Sub retry
      return serverError(errorMessage);
    }
  }
}
