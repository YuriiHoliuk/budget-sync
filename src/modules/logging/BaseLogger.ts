/**
 * BaseLogger - Shared logging logic
 *
 * Provides common functionality for all logger implementations:
 * - Debug topic filtering based on DEBUG env var
 * - Log level management
 * - Abstract writeLog method for subclasses to implement
 */

import type { LogLevel } from './Logger.ts';
import { Logger } from './Logger.ts';

export abstract class BaseLogger extends Logger {
  private readonly enabledDebugTopics: Set<string>;
  private readonly debugAll: boolean;
  private readonly minLevel: LogLevel;

  constructor(minLevel: LogLevel = 'info') {
    super();
    this.minLevel = minLevel;

    // Parse DEBUG env var for enabled topics
    // Examples:
    // - DEBUG=* → enable all topics
    // - DEBUG=monobank,spreadsheet → enable specific topics
    // - DEBUG=monobank* → enable topics starting with "monobank"
    const debugEnv = process.env['DEBUG'] || '';
    this.debugAll = debugEnv === '*';
    this.enabledDebugTopics = new Set(
      debugEnv
        .split(',')
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0 && topic !== '*'),
    );
  }

  debug(
    topic: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    // Debug logs bypass level check - only check if topic is enabled
    if (!this.isDebugTopicEnabled(topic)) {
      return;
    }

    this.writeLog('debug', message, { ...context, topic });
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('info')) {
      return;
    }

    this.writeLog('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('warn')) {
      return;
    }

    this.writeLog('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('error')) {
      return;
    }

    this.writeLog('error', message, context);
  }

  /**
   * Abstract method for subclasses to implement actual log writing
   *
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional contextual data (includes topic for debug logs)
   */
  protected abstract writeLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void;

  /**
   * Check if a debug topic is enabled
   *
   * @param topic - Debug topic to check
   * @returns true if topic is enabled
   */
  private isDebugTopicEnabled(topic: string): boolean {
    if (this.debugAll) {
      return true;
    }

    // Check for exact match
    if (this.enabledDebugTopics.has(topic)) {
      return true;
    }

    // Check for wildcard matches (e.g., "monobank*" matches "monobank:api")
    for (const enabledTopic of this.enabledDebugTopics) {
      if (enabledTopic.endsWith('*')) {
        const prefix = enabledTopic.slice(0, -1);
        if (topic.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a log level is enabled based on minimum level
   *
   * @param level - Log level to check
   * @returns true if level is enabled
   */
  private isLevelEnabled(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);

    return currentLevelIndex >= minLevelIndex;
  }
}
