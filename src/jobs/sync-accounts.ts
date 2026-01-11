/**
 * Cloud Run Job Entry Point: Sync Accounts
 *
 * Synchronizes accounts from Monobank to the spreadsheet.
 * Transactions are handled separately by webhooks.
 *
 * Usage:
 *   bun run src/jobs/sync-accounts.ts
 *
 * Environment:
 *   DEBUG=* or DEBUG=monobank,spreadsheet - Enable debug logging
 */

import 'reflect-metadata';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';
import { SyncAccountsJob } from '../presentation/jobs/SyncAccountsJob.ts';

const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

const job = container.resolve(SyncAccountsJob);
job.run();
