/**
 * Redis Message Queue Gateway Implementation
 *
 * Implements MessageQueueGateway using Redis + BullMQ.
 * Publishing adds jobs to a BullMQ queue. Consumption is push-based and
 * handled in-process by BullMQWorkerRunner, so pull/acknowledge are not
 * supported by this driver.
 */

import {
  MessageQueueGateway,
  type QueueMessage,
} from '@domain/gateways/MessageQueueGateway.ts';
import { type ConnectionOptions, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { inject, injectable } from 'tsyringe';
import {
  REDIS_CONNECTION_TOKEN,
  REDIS_QUEUE_CONFIG_TOKEN,
} from './connection.ts';
import type { RedisQueueConfig } from './types.ts';

@injectable()
export class RedisMessageQueueGateway extends MessageQueueGateway {
  private readonly queue: Queue;

  constructor(
    @inject(REDIS_CONNECTION_TOKEN) connection: Redis,
    @inject(REDIS_QUEUE_CONFIG_TOKEN) config: RedisQueueConfig,
  ) {
    super();
    this.queue = new Queue(config.webhookQueueName, {
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
    const job = await this.queue.add('process', data);
    return job.id ?? '';
  }

  pull(_maxMessages?: number): Promise<QueueMessage[]> {
    return Promise.reject(
      new Error(
        'pull() is not supported by the Redis/BullMQ driver; consumption is handled by BullMQWorkerRunner',
      ),
    );
  }

  acknowledge(_ackId: string): Promise<void> {
    return Promise.reject(
      new Error(
        'acknowledge() is not supported by the Redis/BullMQ driver; consumption is handled by BullMQWorkerRunner',
      ),
    );
  }

  getQueue(): Queue {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
