/**
 * InProcessScheduler
 *
 * Runs the account sync job on a cron schedule inside the monolith process,
 * replacing the Cloud Run Scheduler trigger when self-hosting.
 */

import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { METRICS_TOKEN, type Metrics } from '@modules/metrics/index.ts';
import { Cron } from 'croner';
import { inject, injectable } from 'tsyringe';
import { SyncAccountsJob } from '../jobs/SyncAccountsJob.ts';

@injectable()
export class InProcessScheduler {
  private cron?: Cron;

  constructor(
    private syncAccountsJob: SyncAccountsJob,
    @inject(METRICS_TOKEN) private metrics: Metrics,
    @inject(LOGGER_TOKEN) private logger: Logger,
  ) {}

  start(cronExpr: string, webhookUrl?: string): void {
    if (webhookUrl) {
      this.syncAccountsJob.setWebhookUrl(webhookUrl);
    }

    this.cron = new Cron(cronExpr, { protect: true }, () => {
      void this.runSync();
    });

    this.logger.info('In-process scheduler started', {
      cron: cronExpr,
      nextRun: this.cron.nextRun()?.toISOString(),
    });
  }

  private async runSync(): Promise<void> {
    try {
      const result = await this.syncAccountsJob.execute();
      this.metrics.recordSync({
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors.length,
      });
      this.logger.info('Scheduled sync completed', {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Scheduled sync failed', { error: message });
    }
  }

  stop(): void {
    this.cron?.stop();
  }
}
