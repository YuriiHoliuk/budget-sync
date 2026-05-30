/**
 * Metrics - Abstract class for application metrics
 *
 * Provides a unified metrics interface that can be implemented with a real
 * metrics backend (Prometheus) or a no-op for environments where metrics
 * are disabled.
 */

/**
 * DI token for Metrics implementations.
 */
export const METRICS_TOKEN = Symbol('Metrics');

/**
 * Outcome of a categorization attempt, used as a metric label.
 */
export type CategorizationOutcome = 'ok' | 'rate_limited' | 'error';

export abstract class Metrics {
  /** Increment the count of webhook deliveries received. */
  abstract incWebhookReceived(): void;

  /** Record a processed transaction and how long processing took. */
  abstract recordTransactionProcessed(
    saved: boolean,
    durationSeconds: number,
  ): void;

  /** Record a categorization attempt, its outcome and duration. */
  abstract recordCategorization(
    outcome: CategorizationOutcome,
    durationSeconds: number,
  ): void;

  /** Increment the count of failed jobs for a given queue. */
  abstract incJobFailed(queue: string): void;

  /** Record the result of an account sync run. */
  abstract recordSync(result: {
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  }): void;

  /** Set the current depth of a queue for a given job state. */
  abstract setQueueDepth(queue: string, state: string, value: number): void;

  /** Render the current metrics in the backend's exposition format. */
  abstract render(): Promise<string>;

  /** The content type to use when serving rendered metrics. */
  abstract contentType(): string;
}
