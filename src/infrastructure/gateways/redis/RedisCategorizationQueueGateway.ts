/**
 * Redis Categorization Queue Gateway Implementation
 *
 * Implements CategorizationQueueGateway using Redis + BullMQ.
 * Uses a dedicated queue for categorization requests, separate from the
 * webhook transaction queue. Consumption is handled in-process by
 * BullMQWorkerRunner.
 */

import { CategorizationQueueGateway } from '@domain/gateways/CategorizationQueueGateway.ts';
import { type ConnectionOptions, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { inject, injectable } from 'tsyringe';
import {
  REDIS_CONNECTION_TOKEN,
  REDIS_QUEUE_CONFIG_TOKEN,
} from './connection.ts';
import type { RedisQueueConfig } from './types.ts';

@injectable()
export class RedisCategorizationQueueGateway extends CategorizationQueueGateway {
  private readonly queue: Queue;

  constructor(
    @inject(REDIS_CONNECTION_TOKEN) connection: Redis,
    @inject(REDIS_QUEUE_CONFIG_TOKEN) config: RedisQueueConfig,
  ) {
    super();
    this.queue = new Queue(config.categorizationQueueName, {
      // ioredis is bundled twice (top-level + under bullmq); the instances are
      // structurally identical, so cast across the duplicate type identities.
      connection: connection as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: config.maxAttempts,
        backoff: { type: 'exponential', delay: config.backoffMs },
        removeOnComplete: true,
        removeOnFail: { age: 604800 },
      },
    });
  }

  async publish(data: unknown): Promise<string> {
    const job = await this.queue.add('categorize', data);
    return job.id ?? '';
  }

  getQueue(): Queue {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
