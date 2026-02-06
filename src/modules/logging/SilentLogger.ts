/**
 * SilentLogger - No-op logger for tests
 *
 * Implements the Logger interface but discards all log messages.
 * Useful for integration tests where log output is not needed.
 */

import { injectable } from 'tsyringe';
import { Logger } from './Logger.ts';

@injectable()
export class SilentLogger extends Logger {
  debug(): void {
    // No-op
  }

  info(): void {
    // No-op
  }

  warn(): void {
    // No-op
  }

  error(): void {
    // No-op
  }
}
