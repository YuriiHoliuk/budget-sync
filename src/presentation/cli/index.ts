import { Command } from 'commander';
import type { DependencyContainer } from 'tsyringe';
import {
  createSetWebhookCommand,
  createSyncCommand,
} from './commands/index.ts';

export function createCLI(container: DependencyContainer): Command {
  const program = new Command();

  program
    .name('budget-sync')
    .description('Personal finance management CLI')
    .version('0.1.0');

  program.addCommand(createSetWebhookCommand(container));
  program.addCommand(createSyncCommand(container));

  return program;
}
