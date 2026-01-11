import type { Logger } from '@modules/logging/index.ts';

/**
 * Metadata for CLI command registration.
 */
export interface CommandMeta {
  name: string;
  description: string;
  options?: CommandOption<any>[];
  arguments?: CommandArgument<any>[];
}

/**
 * Definition for a CLI option.
 * @template T - The parsed type of the option value
 */
export interface CommandOption<T = string> {
  /** Option flags, e.g., '--delay <ms>' or '-d, --delay <ms>' */
  flags: string;
  /** Description shown in help text */
  description: string;
  /** Default value if option is not provided */
  defaultValue?: T;
  /** Parser function to convert string input to typed value */
  parse?: (value: string) => T;
}

/**
 * Definition for a CLI positional argument.
 * @template T - The parsed type of the argument value
 */
export interface CommandArgument<T = string> {
  /** Argument name, e.g., 'url' or 'file' */
  name: string;
  /** Description shown in help text */
  description: string;
  /** Whether the argument is required (default: true) */
  required?: boolean;
  /** Default value if argument is not provided */
  defaultValue?: T;
  /** Parser function to convert string input to typed value */
  parse?: (value: string) => T;
}

/**
 * Abstract base class for CLI commands.
 *
 * Provides a standardized structure for CLI commands with:
 * - Declarative metadata for options and arguments
 * - Separate validation and execution phases
 * - Consistent error handling and exit codes
 * - Logger injection via DI
 *
 * @template TOptions - Type of parsed options object
 * @template TArgs - Type of parsed positional arguments array
 *
 * @example
 * ```typescript
 * @injectable()
 * export class SyncCommand extends Command<{ delay: number }> {
 *   meta: CommandMeta = {
 *     name: 'sync',
 *     description: 'Sync data from source',
 *     options: [
 *       {
 *         flags: '--delay <ms>',
 *         description: 'Delay between requests',
 *         defaultValue: 5000,
 *         parse: (value) => parseInt(value, 10),
 *       },
 *     ],
 *   };
 *
 *   async execute(options: { delay: number }): Promise<void> {
 *     // Implementation
 *   }
 * }
 * ```
 *
 * Subclasses must:
 * - Use @injectable() decorator
 * - Inject logger via @inject(LOGGER_TOKEN) in constructor
 */
export abstract class Command<
  TOptions = Record<string, unknown>,
  TArgs = unknown[],
> {
  protected abstract logger: Logger;

  /**
   * Command metadata for CLI registration.
   * Defines name, description, options, and arguments.
   */
  abstract meta: CommandMeta;

  /**
   * Execute the command with parsed options and arguments.
   * This is where the main command logic lives.
   *
   * @param options - Parsed options object with types matching parse functions
   * @param args - Parsed positional arguments array
   */
  abstract execute(options: TOptions, args: TArgs): Promise<void>;

  /**
   * Validate options and arguments after parsing.
   *
   * Override this method for semantic validation that can't be done
   * in parse functions, such as:
   * - Cross-field validation (e.g., end date after start date)
   * - Business rules (e.g., amount must be positive)
   * - File existence checks
   *
   * Syntax validation (format, type) should be in parse functions.
   *
   * @param options - Parsed options object
   * @param args - Parsed positional arguments array
   * @throws Error if validation fails
   */
  protected validate(_options: TOptions, _args: TArgs): void {
    // Default: no validation
  }

  /**
   * Run the command. Called by CLI runner after argument parsing.
   *
   * This method:
   * 1. Calls validate() for semantic validation
   * 2. Calls execute() for main logic
   * 3. Handles errors and sets appropriate exit codes
   *
   * @param options - Parsed options from Commander
   * @param args - Parsed positional arguments from Commander
   */
  async run(options: TOptions, args: TArgs): Promise<void> {
    try {
      this.validate(options, args);
      await this.execute(options, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error: ${message}`);
      process.exit(1);
    }
  }
}
