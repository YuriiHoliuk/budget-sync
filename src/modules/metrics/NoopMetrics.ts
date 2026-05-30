/**
 * NoopMetrics - Metrics implementation that does nothing.
 *
 * Used when metrics are disabled (e.g. local development) so that
 * components depending on Metrics can still be resolved.
 */

import { type CategorizationOutcome, Metrics } from './Metrics.ts';

export class NoopMetrics extends Metrics {
  incWebhookReceived(): void {
    // no-op
  }

  recordTransactionProcessed(_saved: boolean, _durationSeconds: number): void {
    // no-op
  }

  recordCategorization(
    _outcome: CategorizationOutcome,
    _durationSeconds: number,
  ): void {
    // no-op
  }

  incJobFailed(_queue: string): void {
    // no-op
  }

  recordSync(_result: {
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  }): void {
    // no-op
  }

  setQueueDepth(_queue: string, _state: string, _value: number): void {
    // no-op
  }

  render(): Promise<string> {
    return Promise.resolve('');
  }

  contentType(): string {
    return 'text/plain';
  }
}
