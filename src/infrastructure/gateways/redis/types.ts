/**
 * Configuration for the Redis/BullMQ queue driver.
 */
export interface RedisQueueConfig {
  /** BullMQ queue name for incoming webhook transactions */
  webhookQueueName: string;
  /** BullMQ queue name for categorization requests */
  categorizationQueueName: string;
  /** Max delivery attempts before a job is moved to the failed (DLQ) set */
  maxAttempts: number;
  /** Base delay (ms) for exponential backoff between retries */
  backoffMs: number;
  /** Number of jobs each in-process worker handles concurrently */
  workerConcurrency: number;
}
