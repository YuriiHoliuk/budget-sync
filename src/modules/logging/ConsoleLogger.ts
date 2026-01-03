/**
 * ConsoleLogger - Human-readable console logger for CLI
 *
 * Outputs logs with visual prefixes and pretty-printed context.
 * Suitable for local development and CLI usage.
 */

import { BaseLogger } from './BaseLogger.ts';
import type { LogLevel } from './Logger.ts';

export class ConsoleLogger extends BaseLogger {
  private readonly usePrefixes: boolean;

  constructor(minLevel: LogLevel = 'info', usePrefixes = true) {
    super(minLevel);
    this.usePrefixes = usePrefixes;
  }

  protected writeLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const prefix = this.getPrefix(level);
    const formattedMessage = this.formatMessage(prefix, message, context);

    // Use console.error for error/warn, console.log for info/debug
    if (level === 'error' || level === 'warn') {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Get visual prefix for log level
   *
   * @param level - Log level
   * @returns Prefix string
   */
  private getPrefix(level: LogLevel): string {
    if (!this.usePrefixes) {
      return level.toUpperCase();
    }

    switch (level) {
      case 'error':
        return '\u2717'; // ✗
      case 'warn':
        return '\u26A0'; // ⚠
      case 'debug':
        return '\uD83D\uDD0D'; // 🔍
      case 'info':
        return '\u2139'; // ℹ
    }
  }

  /**
   * Format message with prefix and context
   *
   * @param prefix - Visual prefix
   * @param message - Log message
   * @param context - Optional contextual data
   * @returns Formatted message string
   */
  private formatMessage(
    prefix: string,
    message: string,
    context?: Record<string, unknown>,
  ): string {
    const parts = [`${prefix} ${message}`];

    if (context && Object.keys(context).length > 0) {
      parts.push(this.prettyPrintContext(context));
    }

    return parts.join('\n');
  }

  /**
   * Pretty-print context object
   *
   * @param context - Context object to format
   * @returns Formatted context string
   */
  private prettyPrintContext(context: Record<string, unknown>): string {
    const entries = Object.entries(context);
    const lines = entries.map(([key, value]) => {
      const formattedValue = this.formatValue(value);
      return `  ${key}: ${formattedValue}`;
    });

    return lines.join('\n');
  }

  /**
   * Format a single context value
   *
   * @param value - Value to format
   * @returns Formatted value string
   */
  private formatValue(value: unknown): string {
    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'undefined';
    }

    if (value instanceof Error) {
      return `Error: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // For objects and arrays, use JSON.stringify with indentation
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
