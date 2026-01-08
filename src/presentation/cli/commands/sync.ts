import {
  type SyncMonobankOptions,
  SyncMonobankUseCase,
} from '@application/use-cases/SyncMonobank.ts';
import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';

export function createSyncCommand(container: DependencyContainer): Command {
  const command = new Command('sync');

  command
    .description('Synchronize accounts and transactions from Monobank')
    .option(
      '--delay <ms>',
      'Delay between API requests in milliseconds',
      '5000',
    )
    .action(async (options) => {
      try {
        console.log('Starting Monobank synchronization...');
        console.log(
          'Note: This may take several minutes due to API rate limits.\n',
        );

        const syncOptions = buildSyncOptions(options);
        logSyncFromDate(syncOptions.earliestSyncDate);

        const useCase = container.resolve(SyncMonobankUseCase);
        const result = await useCase.execute(syncOptions);

        printSummary(result);

        if (result.errors.length > 0) {
          printErrors(result.errors);
          process.exit(1);
        }

        console.log('\nDone!');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`\nFailed to sync: ${message}`);
        process.exit(1);
      }
    });

  return command;
}

function buildSyncOptions(cliOptions: { delay: string }): SyncMonobankOptions {
  const syncOptions: SyncMonobankOptions = {
    requestDelayMs: Number.parseInt(cliOptions.delay, 10),
  };

  const syncFromDate = parseSyncFromDateEnv();
  if (syncFromDate) {
    syncOptions.earliestSyncDate = syncFromDate;
    syncOptions.forceFromDate = true; // Force backfill from specified date
  }

  return syncOptions;
}

function parseSyncFromDateEnv(): Date | undefined {
  const syncFromDateStr = process.env['SYNC_FROM_DATE'];
  if (!syncFromDateStr) {
    return undefined;
  }

  const date = new Date(syncFromDateStr);
  if (Number.isNaN(date.getTime())) {
    console.error(
      `Invalid SYNC_FROM_DATE format: ${syncFromDateStr}. Use YYYY-MM-DD format.`,
    );
    process.exit(1);
  }

  return date;
}

function logSyncFromDate(earliestSyncDate: Date | undefined): void {
  if (earliestSyncDate) {
    const dateStr = earliestSyncDate.toISOString().split('T')[0];
    console.log(`Syncing from date: ${dateStr}\n`);
  }
}

function printSummary(
  result: Awaited<ReturnType<SyncMonobankUseCase['execute']>>,
): void {
  console.log('\nSynchronization completed:');
  console.log('\nAccounts:');
  console.log(`  Created:   ${result.accounts.created}`);
  console.log(`  Updated:   ${result.accounts.updated}`);
  console.log(`  Unchanged: ${result.accounts.unchanged}`);

  console.log('\nTransactions:');
  console.log(
    `  Accounts synced: ${result.transactions.syncedAccounts}/${result.transactions.totalAccounts}`,
  );
  console.log(`  New:      ${result.transactions.newTransactions}`);
  console.log(`  Updated:  ${result.transactions.updatedTransactions}`);
  console.log(`  Skipped:  ${result.transactions.skippedTransactions}`);
}

function printErrors(errors: string[]): void {
  console.log('\nErrors:');
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
}
