/**
 * Cloud Run Job: Process Webhooks
 *
 * Entry point for the webhook processing job.
 * See ProcessWebhooksJob for implementation details.
 *
 * Usage:
 *   bun run src/jobs/process-webhooks.ts
 *
 * Environment:
 *   MAX_MESSAGES - Maximum messages to pull per batch (default: 10)
 *   DEBUG=* or DEBUG=webhook,pubsub - Enable debug logging
 */

import 'reflect-metadata';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { ProcessWebhooksJob } from '../presentation/jobs/ProcessWebhooksJob.ts';

const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

const job = container.resolve(ProcessWebhooksJob);
job.run();
