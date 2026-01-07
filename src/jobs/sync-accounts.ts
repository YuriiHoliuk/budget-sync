/**
 * Cloud Run Job: Sync Accounts
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
import { SyncAccountsUseCase } from '../application/use-cases/SyncAccounts.ts';
import { setupContainer } from '../container.ts';
import { LOGGER_TOKEN, type Logger } from '../modules/logging/Logger.ts';
import { StructuredLogger } from '../modules/logging/StructuredLogger.ts';

async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const useCase = container.resolve(SyncAccountsUseCase);

  try {
    logger.info('Starting accounts sync job');
    const result = await useCase.execute();
    logger.info('Job completed', {
      accountsCreated: result.created,
      accountsUpdated: result.updated,
      accountsUnchanged: result.unchanged,
      errorCount: result.errors.length,
    });

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        logger.error('Sync error', { error });
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Job failed', { error: message });
    process.exit(1);
  }
}

main();
