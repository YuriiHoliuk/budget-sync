import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { RedisMessageQueueGateway } from '@infrastructure/gateways/redis/RedisMessageQueueGateway.ts';
import type { RedisQueueConfig } from '@infrastructure/gateways/redis/types.ts';
import type { Queue } from 'bullmq';

const config: RedisQueueConfig = {
  webhookQueueName: 'webhook-transactions',
  categorizationQueueName: 'categorization-queue',
  maxAttempts: 5,
  backoffMs: 2000,
  workerConcurrency: 4,
};

/**
 * The gateway constructs a BullMQ Queue in its constructor. We don't want a
 * live Redis, so we build the gateway with a dummy connection/config and then
 * replace the internal queue with a stub via the readonly field cast.
 */
function createGateway(addResult: { id?: string } = { id: 'job-1' }) {
  const gateway = Object.create(
    RedisMessageQueueGateway.prototype,
  ) as RedisMessageQueueGateway;

  const add = mock(() => Promise.resolve(addResult));
  const fakeQueue = { add, name: config.webhookQueueName } as unknown as Queue;

  (gateway as unknown as { queue: Queue }).queue = fakeQueue;

  return { gateway, add };
}

describe('RedisMessageQueueGateway', () => {
  test('publish adds a job named "process" and returns the job id', async () => {
    const { gateway, add } = createGateway({ id: 'job-42' });

    const id = await gateway.publish({ hello: 'world' });

    expect(add).toHaveBeenCalledWith('process', { hello: 'world' });
    expect(id).toBe('job-42');
  });

  test('publish returns empty string when the job has no id', async () => {
    const { gateway } = createGateway({});

    const id = await gateway.publish({ hello: 'world' });

    expect(id).toBe('');
  });

  test('pull rejects (not supported by the Redis driver)', async () => {
    const { gateway } = createGateway();

    await expect(gateway.pull()).rejects.toThrow('not supported');
  });

  test('acknowledge rejects (not supported by the Redis driver)', async () => {
    const { gateway } = createGateway();

    await expect(gateway.acknowledge('ack-1')).rejects.toThrow('not supported');
  });
});
