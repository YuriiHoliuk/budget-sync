import { SyncTransactionsUseCase } from '@application/use-cases/SyncTransactions.ts';
import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';

export function createSyncTransactionsCommand(
  container: DependencyContainer,
): Command {
  const command = new Command('sync-transactions');

  command
    .description('Synchronize transactions from Monobank to spreadsheet')
    .option('--delay <ms>', 'Delay between API requests in ms', '5000')
    .action(async (options) => {
      try {
        console.log('Starting transaction synchronization...');
        console.log(
          'Note: This may take several minutes due to API rate limits.\n',
        );

        const requestDelayMs = Number.parseInt(options.delay, 10);

        const useCase = container.resolve(SyncTransactionsUseCase);
        const result = await useCase.execute({ requestDelayMs });

        console.log('\nSynchronization completed:');
        console.log(
          `  Accounts synced: ${result.syncedAccounts}/${result.totalAccounts}`,
        );
        console.log(`  New transactions: ${result.newTransactions}`);
        console.log(`  Skipped (duplicates): ${result.skippedTransactions}`);

        if (result.errors.length > 0) {
          console.log('\nErrors:');
          for (const error of result.errors) {
            console.log(`  - ${error}`);
          }
          process.exit(1);
        }

        console.log('\nDone!');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`\nFailed to sync transactions: ${message}`);
        process.exit(1);
      }
    });

  return command;
}
