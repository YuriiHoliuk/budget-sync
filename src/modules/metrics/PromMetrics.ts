/**
 * PromMetrics - Prometheus-backed Metrics implementation.
 *
 * Owns its own Registry so metrics are isolated and testable, and collects
 * Node.js default process metrics into the same registry.
 */

import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { type CategorizationOutcome, Metrics } from './Metrics.ts';

export class PromMetrics extends Metrics {
  private readonly registry = new Registry();

  private readonly webhooksReceived: Counter;
  private readonly transactionsProcessed: Counter<'saved'>;
  private readonly transactionProcessingSeconds: Histogram;
  private readonly categorizationSeconds: Histogram<'outcome'>;
  private readonly jobsFailed: Counter<'queue'>;
  private readonly queueDepth: Gauge<'queue' | 'state'>;
  private readonly syncRuns: Counter;
  private readonly lastSyncAccounts: Gauge<'outcome'>;

  constructor() {
    super();

    collectDefaultMetrics({ register: this.registry });

    this.webhooksReceived = new Counter({
      name: 'budget_sync_webhooks_received_total',
      help: 'Total number of webhook deliveries received',
      registers: [this.registry],
    });

    this.transactionsProcessed = new Counter({
      name: 'budget_sync_transactions_processed_total',
      help: 'Total number of incoming transactions processed',
      labelNames: ['saved'],
      registers: [this.registry],
    });

    this.transactionProcessingSeconds = new Histogram({
      name: 'budget_sync_transaction_processing_seconds',
      help: 'Time spent processing an incoming transaction',
      registers: [this.registry],
    });

    this.categorizationSeconds = new Histogram({
      name: 'budget_sync_categorization_seconds',
      help: 'Time spent categorizing a transaction',
      labelNames: ['outcome'],
      registers: [this.registry],
    });

    this.jobsFailed = new Counter({
      name: 'budget_sync_jobs_failed_total',
      help: 'Total number of failed jobs by queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'budget_sync_queue_depth',
      help: 'Number of jobs in a queue by state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.syncRuns = new Counter({
      name: 'budget_sync_sync_runs_total',
      help: 'Total number of account sync runs',
      registers: [this.registry],
    });

    this.lastSyncAccounts = new Gauge({
      name: 'budget_sync_last_sync_accounts',
      help: 'Account counts from the most recent sync run by outcome',
      labelNames: ['outcome'],
      registers: [this.registry],
    });
  }

  incWebhookReceived(): void {
    this.webhooksReceived.inc();
  }

  recordTransactionProcessed(saved: boolean, durationSeconds: number): void {
    this.transactionsProcessed.inc({ saved: String(saved) });
    this.transactionProcessingSeconds.observe(durationSeconds);
  }

  recordCategorization(
    outcome: CategorizationOutcome,
    durationSeconds: number,
  ): void {
    this.categorizationSeconds.observe({ outcome }, durationSeconds);
  }

  incJobFailed(queue: string): void {
    this.jobsFailed.inc({ queue });
  }

  recordSync(result: {
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  }): void {
    this.syncRuns.inc();
    this.lastSyncAccounts.set({ outcome: 'created' }, result.created);
    this.lastSyncAccounts.set({ outcome: 'updated' }, result.updated);
    this.lastSyncAccounts.set({ outcome: 'unchanged' }, result.unchanged);
    this.lastSyncAccounts.set({ outcome: 'errors' }, result.errors);
  }

  setQueueDepth(queue: string, state: string, value: number): void {
    this.queueDepth.set({ queue, state }, value);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
