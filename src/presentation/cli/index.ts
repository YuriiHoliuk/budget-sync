import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';
import { createSyncAccountsCommand } from './commands/sync-accounts.ts';

export function createCLI(container: DependencyContainer): Command {
  const program = new Command();

  program
    .name('budget-sync')
    .description('Personal finance management CLI')
    .version('0.1.0');

  program.addCommand(createSyncAccountsCommand(container));

  return program;
}
