import { SyncMonobankUseCase } from '@application/use-cases/SyncMonobank.ts';
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

        const requestDelayMs = Number.parseInt(options.delay, 10);
        const useCase = container.resolve(SyncMonobankUseCase);
        const result = await useCase.execute({ requestDelayMs });

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
  console.log(
    `  New transactions:       ${result.transactions.newTransactions}`,
  );
  console.log(
    `  Skipped (duplicates):   ${result.transactions.skippedTransactions}`,
  );
}

function printErrors(errors: string[]): void {
  console.log('\nErrors:');
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
}
