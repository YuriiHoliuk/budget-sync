/**
 * BullMQWorkerRunner
 *
 * Runs the in-process BullMQ workers that consume the webhook and
 * categorization queues when the Redis/BullMQ driver is active.
 *
 * Job data is validated with the same Zod schemas used when publishing.
 * Invalid payloads throw UnrecoverableError so BullMQ does not retry them.
 */

import { queuedCategorizationSchema } from '@application/dtos/QueuedCategorizationDTO.ts';
import { queuedWebhookTransactionSchema } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import { CategorizeTransactionUseCase } from '@application/use-cases/CategorizeTransaction.ts';
import { ProcessIncomingTransactionUseCase } from '@application/use-cases/ProcessIncomingTransaction.ts';
import {
  REDIS_CONNECTION_TOKEN,
  REDIS_QUEUE_CONFIG_TOKEN,
  RedisCategorizationQueueGateway,
  RedisMessageQueueGateway,
  type RedisQueueConfig,
} from '@infrastructure/gateways/redis/index.ts';
import { LLMRateLimitError } from '@modules/llm/index.ts';
import { LOGGER_TOKEN, type Logger } from '@modules/logging/index.ts';
import { METRICS_TOKEN, type Metrics } from '@modules/metrics/index.ts';
import {
  type ConnectionOptions,
  type Job,
  UnrecoverableError,
  Worker,
} from 'bullmq';
import type { Redis } from 'ioredis';
import { inject, injectable } from 'tsyringe';

const QUEUE_DEPTH_INTERVAL_MS = 15000;

@injectable()
export class BullMQWorkerRunner {
  private webhookWorker?: Worker;
  private categorizationWorker?: Worker;
  private queueDepthInterval?: ReturnType<typeof setInterval>;

  constructor(
    private webhookGateway: RedisMessageQueueGateway,
    private categorizationGateway: RedisCategorizationQueueGateway,
    private processIncomingTransaction: ProcessIncomingTransactionUseCase,
    private categorizeTransaction: CategorizeTransactionUseCase,
    @inject(REDIS_CONNECTION_TOKEN) private connection: Redis,
    @inject(REDIS_QUEUE_CONFIG_TOKEN) private config: RedisQueueConfig,
    @inject(METRICS_TOKEN) private metrics: Metrics,
    @inject(LOGGER_TOKEN) private logger: Logger,
  ) {}

  start(): void {
    // ioredis is bundled twice (top-level + under bullmq); the instances are
    // structurally identical, so cast across the duplicate type identities.
    const connection = this.connection as unknown as ConnectionOptions;

    this.webhookWorker = new Worker(
      this.config.webhookQueueName,
      this.handleWebhookJob,
      {
        connection,
        concurrency: this.config.workerConcurrency,
      },
    );

    this.categorizationWorker = new Worker(
      this.config.categorizationQueueName,
      this.handleCategorizationJob,
      {
        connection,
        concurrency: this.config.workerConcurrency,
      },
    );

    this.webhookWorker.on('failed', (_job, err) => {
      this.metrics.incJobFailed(this.config.webhookQueueName);
      this.logger.error('Webhook job failed', { error: err.message });
    });
    this.webhookWorker.on('error', (err) => {
      this.logger.error('Webhook worker error', { error: err.message });
    });

    this.categorizationWorker.on('failed', (_job, err) => {
      this.metrics.incJobFailed(this.config.categorizationQueueName);
      this.logger.error('Categorization job failed', { error: err.message });
    });
    this.categorizationWorker.on('error', (err) => {
      this.logger.error('Categorization worker error', { error: err.message });
    });

    this.queueDepthInterval = setInterval(() => {
      void this.updateQueueDepth();
    }, QUEUE_DEPTH_INTERVAL_MS);
    void this.updateQueueDepth();

    this.logger.info('BullMQ workers started', {
      webhookQueue: this.config.webhookQueueName,
      categorizationQueue: this.config.categorizationQueueName,
      concurrency: this.config.workerConcurrency,
    });
  }

  private handleWebhookJob = async (job: Job): Promise<void> => {
    const start = performance.now();
    const parsed = queuedWebhookTransactionSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid webhook job data: ${parsed.error.message}`,
      );
    }

    const result = await this.processIncomingTransaction.execute(parsed.data);
    this.metrics.recordTransactionProcessed(
      result.saved,
      (performance.now() - start) / 1000,
    );
  };

  private handleCategorizationJob = async (job: Job): Promise<void> => {
    const start = performance.now();
    const parsed = queuedCategorizationSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid categorization job data: ${parsed.error.message}`,
      );
    }

    try {
      await this.categorizeTransaction.execute({
        transactionDbId: parsed.data.transactionDbId,
      });
      this.metrics.recordCategorization(
        'ok',
        (performance.now() - start) / 1000,
      );
    } catch (error) {
      const durationSeconds = (performance.now() - start) / 1000;
      if (error instanceof LLMRateLimitError) {
        this.metrics.recordCategorization('rate_limited', durationSeconds);
        throw error;
      }
      this.metrics.recordCategorization('error', durationSeconds);
      throw error;
    }
  };

  private async updateQueueDepth(): Promise<void> {
    try {
      for (const gateway of [this.webhookGateway, this.categorizationGateway]) {
        const queue = gateway.getQueue();
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
        );
        for (const [state, value] of Object.entries(counts)) {
          this.metrics.setQueueDepth(queue.name, state, value);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update queue depth metrics', {
        error: message,
      });
    }
  }

  async stop(): Promise<void> {
    if (this.queueDepthInterval) {
      clearInterval(this.queueDepthInterval);
    }
    await Promise.all(
      [this.webhookWorker?.close(), this.categorizationWorker?.close()].filter(
        Boolean,
      ),
    );
  }
}
