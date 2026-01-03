/**
 * Logger - Abstract class for logging
 *
 * Provides a unified logging interface that can be implemented
 * for different environments (console, structured JSON, etc.).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export abstract class Logger {
  /**
   * Log a debug message with a topic.
   * Debug logs are only shown if the topic is enabled via DEBUG env var.
   *
   * @param topic - Debug topic (e.g., "monobank", "spreadsheet")
   * @param message - Log message
   * @param context - Optional contextual data
   */
  abstract debug(
    topic: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Log an informational message
   *
   * @param message - Log message
   * @param context - Optional contextual data
   */
  abstract info(message: string, context?: Record<string, unknown>): void;

  /**
   * Log a warning message
   *
   * @param message - Log message
   * @param context - Optional contextual data
   */
  abstract warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Log an error message
   *
   * @param message - Log message
   * @param context - Optional contextual data
   */
  abstract error(message: string, context?: Record<string, unknown>): void;
}

/**
 * DI token for Logger
 *
 * Use this token to register Logger implementations in the DI container:
 *
 * ```typescript
 * import { container } from 'tsyringe';
 * import { LOGGER_TOKEN, ConsoleLogger } from '@modules/logging';
 *
 * container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });
 * ```
 */
export const LOGGER_TOKEN = Symbol('Logger');
