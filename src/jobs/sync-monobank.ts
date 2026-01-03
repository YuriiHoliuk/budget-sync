/**
 * Cloud Run Job: Sync Monobank
 *
 * Synchronizes accounts and transactions from Monobank to the spreadsheet.
 * This is a direct entry point for Cloud Run Jobs that bypasses the CLI.
 *
 * Usage:
 *   bun run src/jobs/sync-monobank.ts
 *
 * Environment:
 *   DEBUG=* or DEBUG=monobank,spreadsheet - Enable debug logging
 */

import 'reflect-metadata';
import { SyncMonobankUseCase } from '../application/use-cases/SyncMonobank.ts';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const useCase = container.resolve(SyncMonobankUseCase);

  try {
    logger.info('Starting sync job');
    const result = await useCase.execute();
    logger.info('Job completed', {
      accountsCreated: result.accounts.created,
      accountsUpdated: result.accounts.updated,
      transactionsSynced: result.transactions.syncedAccounts,
      newTransactions: result.transactions.newTransactions,
      skippedTransactions: result.transactions.skippedTransactions,
      errorCount: result.errors.length,
    });
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Job failed', { error: message });
    process.exit(1);
  }
}

main();
