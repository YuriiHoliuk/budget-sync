/**
 * Cloud Run Job: Process Webhooks
 *
 * Pulls messages from Pub/Sub and processes incoming transactions.
 * This is a direct entry point for Cloud Run Jobs.
 *
 * Behavior (SQS-like retry pattern):
 * 1. Pull batch of messages from Pub/Sub
 * 2. For each message:
 *    - Call ProcessIncomingTransaction use case
 *    - On success: acknowledge message (removed from queue)
 *    - On failure: don't acknowledge (message stays in queue, will be redelivered)
 * 3. Pub/Sub handles retry with exponential backoff (10s-600s)
 * 4. After max_delivery_attempts (5), message goes to DLQ topic
 *
 * Usage:
 *   bun run src/jobs/process-webhooks.ts
 *
 * Environment:
 *   MAX_MESSAGES - Maximum messages to pull per batch (default: 10)
 *   DEBUG=* or DEBUG=webhook,pubsub - Enable debug logging
 */

import 'reflect-metadata';
import type { QueuedWebhookTransactionDTO } from '../application/dtos/QueuedWebhookTransactionDTO.ts';
import { ProcessIncomingTransactionUseCase } from '../application/use-cases/ProcessIncomingTransaction.ts';
import { setupContainer } from '../container.ts';
import {
  MESSAGE_QUEUE_GATEWAY_TOKEN,
  type MessageQueueGateway,
  type QueueMessage,
} from '../domain/gateways/MessageQueueGateway.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';

const DEFAULT_MAX_MESSAGES = 10;

interface ProcessingResult {
  processed: number;
  failed: number;
  total: number;
}

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const messageQueueGateway = container.resolve<MessageQueueGateway>(
    MESSAGE_QUEUE_GATEWAY_TOKEN,
  );
  const processTransaction = container.resolve(
    ProcessIncomingTransactionUseCase,
  );

  const maxMessages = getMaxMessages();

  try {
    logger.info('Starting webhook processing job', { maxMessages });

    const result = await processMessages(
      messageQueueGateway,
      processTransaction,
      logger,
      maxMessages,
    );

    logger.info('Job completed', {
      processed: result.processed,
      failed: result.failed,
      total: result.total,
    });

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Job failed', { error: message });
    process.exit(1);
  }
}

function getMaxMessages(): number {
  const maxMessagesEnv = process.env['MAX_MESSAGES'];
  if (maxMessagesEnv) {
    const parsed = Number.parseInt(maxMessagesEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_MESSAGES;
}

async function processMessages(
  gateway: MessageQueueGateway,
  useCase: ProcessIncomingTransactionUseCase,
  logger: Logger,
  maxMessages: number,
): Promise<ProcessingResult> {
  const messages = await gateway.pull(maxMessages);

  logger.info('Pulled messages from queue', { count: messages.length });

  if (messages.length === 0) {
    return { processed: 0, failed: 0, total: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const message of messages) {
    const success = await processSingleMessage(
      message,
      gateway,
      useCase,
      logger,
    );
    if (success) {
      processed++;
    } else {
      failed++;
    }
  }

  return { processed, failed, total: messages.length };
}

async function processSingleMessage(
  message: QueueMessage,
  gateway: MessageQueueGateway,
  useCase: ProcessIncomingTransactionUseCase,
  logger: Logger,
): Promise<boolean> {
  const logContext = {
    messageId: message.messageId,
    deliveryAttempt: message.deliveryAttempt,
  };

  try {
    logger.debug('webhook', 'Processing message', logContext);

    const transactionData = message.data as QueuedWebhookTransactionDTO;
    const result = await useCase.execute(transactionData);

    await gateway.acknowledge(message.ackId);

    logger.info('Message processed successfully', {
      ...logContext,
      saved: result.saved,
      transactionExternalId: result.transactionExternalId,
    });

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to process message', {
      ...logContext,
      error: errorMessage,
    });

    // Don't acknowledge - message will be redelivered by Pub/Sub
    return false;
  }
}

main();
