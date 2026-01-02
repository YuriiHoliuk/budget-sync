import { SyncAccountsUseCase } from '@application/use-cases/SyncAccounts.ts';
import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';

export function createSyncAccountsCommand(
  container: DependencyContainer,
): Command {
  const command = new Command('sync-accounts');

  command
    .description('Synchronize accounts from Monobank to spreadsheet')
    .action(async () => {
      try {
        console.log('Starting account synchronization...\n');

        const useCase = container.resolve(SyncAccountsUseCase);
        const result = await useCase.execute();

        console.log('Synchronization completed:');
        console.log(`  Created: ${result.created}`);
        console.log(`  Updated: ${result.updated}`);
        console.log(`  Unchanged: ${result.unchanged}`);

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
        console.error(`\nFailed to sync accounts: ${message}`);
        process.exit(1);
      }
    });

  return command;
}
