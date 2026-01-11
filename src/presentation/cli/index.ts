import { Command as CommanderCommand } from 'commander';
import type { DependencyContainer, InjectionToken } from 'tsyringe';
import type { Command, CommandMeta, CommandOption } from './Command.ts';
import { SetWebhookCommand } from './commands/SetWebhookCommand.ts';
import { SyncCommand } from './commands/SyncCommand.ts';

// Registry of command classes - add new commands here
const COMMANDS: InjectionToken<Command<any, any>>[] = [
  SyncCommand,
  SetWebhookCommand,
];

export function createCLI(container: DependencyContainer): CommanderCommand {
  const program = new CommanderCommand();

  program
    .name('budget-sync')
    .description('Personal finance management CLI')
    .version('0.1.0');

  for (const CommandClass of COMMANDS) {
    const command = container.resolve(CommandClass);
    registerCommand(program, command);
  }

  return program;
}

function registerCommand(
  program: CommanderCommand,
  command: Command<any, any>,
): void {
  const { meta } = command;
  const cmd = program.command(meta.name).description(meta.description);

  registerOptions(cmd, meta);
  registerArguments(cmd, meta);
  wireAction(cmd, command, meta);
}

function registerOptions(cmd: CommanderCommand, meta: CommandMeta): void {
  for (const opt of meta.options ?? []) {
    registerOption(cmd, opt);
  }
}

function registerOption(cmd: CommanderCommand, opt: CommandOption<any>): void {
  if (opt.parse) {
    // Commander overload: (flags, description, parseArg, defaultValue)
    cmd.option(
      opt.flags,
      opt.description,
      opt.parse as (value: string, previous: unknown) => unknown,
      opt.defaultValue,
    );
  } else {
    cmd.option(
      opt.flags,
      opt.description,
      opt.defaultValue as string | boolean | undefined,
    );
  }
}

function registerArguments(cmd: CommanderCommand, meta: CommandMeta): void {
  for (const arg of meta.arguments ?? []) {
    const argStr = arg.required !== false ? `<${arg.name}>` : `[${arg.name}]`;
    if (arg.parse) {
      cmd.argument(argStr, arg.description, arg.parse, arg.defaultValue);
    } else {
      cmd.argument(argStr, arg.description, arg.defaultValue);
    }
  }
}

function wireAction(
  cmd: CommanderCommand,
  command: Command,
  meta: CommandMeta,
): void {
  cmd.action(async (...args: unknown[]) => {
    // Commander passes: ...positionalArgs, options, commandInstance
    const options = args[args.length - 2] as Record<string, unknown>;
    const positionalArgs = args.slice(0, meta.arguments?.length ?? 0);
    await command.run(options, positionalArgs);
  });
}
