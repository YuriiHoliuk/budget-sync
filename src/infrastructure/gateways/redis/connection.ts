/**
 * Redis connection helpers for the Redis/BullMQ queue driver.
 */

import { Redis } from 'ioredis';

/**
 * Injection token for the shared ioredis connection.
 * Use with @inject(REDIS_CONNECTION_TOKEN) in classes that depend on Redis.
 */
export const REDIS_CONNECTION_TOKEN = Symbol('RedisConnection');

/**
 * Injection token for RedisQueueConfig.
 * Use with @inject(REDIS_QUEUE_CONFIG_TOKEN) in classes that depend on RedisQueueConfig.
 */
export const REDIS_QUEUE_CONFIG_TOKEN = Symbol('RedisQueueConfig');

/**
 * Create an ioredis connection configured for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection used by
 * workers (blocking commands must not time out), so this is set here.
 */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
