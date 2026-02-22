/**
 * Cloud Run Job Entry Point: Sync Accounts
 *
 * Synchronizes accounts from Monobank to the spreadsheet.
 * Transactions are handled separately by webhooks.
 *
 * Also re-registers the webhook URL with Monobank as a safety net
 * (if WEBHOOK_URL env var is set).
 *
 * Usage:
 *   bun run src/jobs/sync-accounts.ts
 *
 * Environment:
 *   DEBUG=* or DEBUG=monobank,spreadsheet - Enable debug logging
 *   WEBHOOK_URL - Webhook URL to re-register with Monobank (optional)
 */

import 'reflect-metadata';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { SyncAccountsJob } from '../presentation/jobs/SyncAccountsJob.ts';

const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

const job = container.resolve(SyncAccountsJob);

const webhookUrl = process.env['WEBHOOK_URL'];
if (webhookUrl) {
  job.setWebhookUrl(webhookUrl);
}

job.run();
