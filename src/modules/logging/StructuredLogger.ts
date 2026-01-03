/**
 * StructuredLogger - JSON logger for Cloud Run
 *
 * Outputs structured JSON logs compatible with Google Cloud Logging.
 * Each log entry includes severity, message, timestamp, and context.
 */

import { BaseLogger } from './BaseLogger.ts';
import type { LogLevel } from './Logger.ts';

/**
 * Structured log entry matching Google Cloud Logging format
 */
interface LogEntry {
  severity: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

export class StructuredLogger extends BaseLogger {
  constructor(minLevel: LogLevel = 'info') {
    super(minLevel);
  }

  protected writeLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = this.createLogEntry(level, message, context);
    const jsonOutput = JSON.stringify(entry);

    // Use console.error for error/warn, console.log for info/debug
    // Google Cloud Logging captures both stdout and stderr
    if (level === 'error' || level === 'warn') {
      console.error(jsonOutput);
    } else {
      console.log(jsonOutput);
    }
  }

  /**
   * Create a structured log entry
   *
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional contextual data
   * @returns Structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): LogEntry {
    const entry: LogEntry = {
      severity: this.mapSeverity(level),
      message,
      timestamp: new Date().toISOString(),
    };

    // Merge context into log entry
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        entry[key] = this.serializeValue(value);
      }
    }

    return entry;
  }

  /**
   * Map log level to Google Cloud Logging severity
   *
   * @param level - Log level
   * @returns Cloud Logging severity string
   */
  private mapSeverity(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return 'DEBUG';
      case 'info':
        return 'INFO';
      case 'warn':
        return 'WARNING';
      case 'error':
        return 'ERROR';
    }
  }

  /**
   * Serialize a value for JSON output
   *
   * Handles special types like Error and Date that don't serialize well
   * with JSON.stringify alone.
   *
   * @param value - Value to serialize
   * @returns Serializable value
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      // Recursively serialize object properties
      if (Array.isArray(value)) {
        return value.map((item) => this.serializeValue(item));
      }

      const serialized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        serialized[key] = this.serializeValue(val);
      }
      return serialized;
    }

    // Primitives (string, number, boolean) are already serializable
    return value;
  }
}
