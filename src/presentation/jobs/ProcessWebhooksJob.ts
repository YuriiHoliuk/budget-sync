/**
 * ProcessWebhooksJob
 *
 * Pulls messages from Pub/Sub and processes incoming transactions.
 *
 * Behavior (SQS-like retry pattern):
 * 1. Pull batch of messages from Pub/Sub
 * 2. For each message:
 *    - Call ProcessIncomingTransaction use case
 *    - On success: acknowledge message (removed from queue)
 *    - On failure: don't acknowledge (message stays in queue, will be redelivered)
 * 3. Pub/Sub handles retry with exponential backoff (10s-600s)
 * 4. After max_delivery_attempts (5), message goes to DLQ topic
 */

import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { ProcessIncomingTransactionUseCase } from '@application/use-cases/ProcessIncomingTransaction.ts';
import {
  MESSAGE_QUEUE_GATEWAY_TOKEN,
  type MessageQueueGateway,
  type QueueMessage,
} from '@domain/gateways/MessageQueueGateway.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/Logger.ts';
import { inject, injectable } from 'tsyringe';
import { Job, type JobResult } from './Job.ts';

const DEFAULT_MAX_MESSAGES = 10;

interface ProcessingResult {
  processed: number;
  failed: number;
  total: number;
}

@injectable()
export class ProcessWebhooksJob extends Job<ProcessingResult> {
  constructor(
    @inject(LOGGER_TOKEN) protected logger: Logger,
    @inject(MESSAGE_QUEUE_GATEWAY_TOKEN)
    private messageQueueGateway: MessageQueueGateway,
    private processTransactionUseCase: ProcessIncomingTransactionUseCase,
  ) {
    super();
  }

  async execute(): Promise<ProcessingResult> {
    const maxMessages = this.getMaxMessages();
    this.logger.info('Processing webhooks', { maxMessages });

    const messages = await this.messageQueueGateway.pull(maxMessages);
    this.logger.info('Pulled messages from queue', { count: messages.length });

    if (messages.length === 0) {
      return { processed: 0, failed: 0, total: 0 };
    }

    return this.processMessages(messages);
  }

  protected override toJobResult(result: ProcessingResult): JobResult {
    return {
      success: result.failed === 0,
      exitCode: result.failed > 0 ? 1 : 0,
      summary: {
        processed: result.processed,
        failed: result.failed,
        total: result.total,
      },
    };
  }

  private getMaxMessages(): number {
    const maxMessagesEnv = process.env['MAX_MESSAGES'];
    if (maxMessagesEnv) {
      const parsed = Number.parseInt(maxMessagesEnv, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return DEFAULT_MAX_MESSAGES;
  }

  private async processMessages(
    messages: QueueMessage[],
  ): Promise<ProcessingResult> {
    let processed = 0;
    let failed = 0;

    for (const message of messages) {
      const success = await this.processSingleMessage(message);
      if (success) {
        processed++;
      } else {
        failed++;
      }
    }

    return { processed, failed, total: messages.length };
  }

  private async processSingleMessage(message: QueueMessage): Promise<boolean> {
    const logContext = {
      messageId: message.messageId,
      deliveryAttempt: message.deliveryAttempt,
    };

    try {
      this.logger.debug('webhook', 'Processing message', logContext);

      const transactionData = message.data as QueuedWebhookTransactionDTO;
      const result =
        await this.processTransactionUseCase.execute(transactionData);

      await this.messageQueueGateway.acknowledge(message.ackId);

      this.logger.info('Message processed successfully', {
        ...logContext,
        saved: result.saved,
        transactionExternalId: result.transactionExternalId,
      });

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to process message', {
        ...logContext,
        error: errorMessage,
      });

      // Don't acknowledge - message will be redelivered by Pub/Sub
      return false;
    }
  }
}
