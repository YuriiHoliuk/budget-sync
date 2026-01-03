/**
 * Logging Module
 *
 * Provides business-agnostic logging utilities for different environments.
 *
 * Two logger implementations:
 * 1. ConsoleLogger - Human-readable console output for CLI/development
 * 2. StructuredLogger - JSON output for Cloud Run/production
 *
 * Debug logging supports topic-based filtering via DEBUG env var:
 * - DEBUG=* → enable all debug topics
 * - DEBUG=monobank,spreadsheet → enable specific topics
 * - DEBUG=monobank* → enable topics matching pattern
 *
 * Usage example:
 *
 * ```typescript
 * import { container } from 'tsyringe';
 * import { LOGGER_TOKEN, ConsoleLogger, type Logger } from '@modules/logging';
 *
 * // Register logger in DI container
 * container.register(LOGGER_TOKEN, { useClass: ConsoleLogger });
 *
 * // Use in application
 * import { inject, injectable } from 'tsyringe';
 *
 * @injectable()
 * class MyService {
 *   constructor(@inject(LOGGER_TOKEN) private logger: Logger) {}
 *
 *   async doWork(): Promise<void> {
 *     this.logger.info('Starting work');
 *     this.logger.debug('myservice', 'Processing item', { id: '123' });
 *     this.logger.error('Work failed', { error: new Error('oops') });
 *   }
 * }
 * ```
 */

// Base implementation
export { BaseLogger } from './BaseLogger.ts';
// Concrete implementations
export { ConsoleLogger } from './ConsoleLogger.ts';
// Abstract class and token
export { LOGGER_TOKEN, Logger, type LogLevel } from './Logger.ts';
export { StructuredLogger } from './StructuredLogger.ts';
