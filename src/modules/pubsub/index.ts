/**
 * Pub/Sub Module
 *
 * Provides business-agnostic utilities for working with Google Cloud Pub/Sub.
 *
 * Usage example:
 *
 * ```typescript
 * import {
 *   PubSubClient,
 *   type PublishMessage,
 *   type ReceivedMessage,
 * } from '@modules/pubsub';
 *
 * // Create client (uses ADC in cloud, or explicit service account locally)
 * const client = new PubSubClient({
 *   projectId: 'my-project',
 *   serviceAccountFile: 'service-account.json', // optional
 * });
 *
 * // Publish a message
 * const result = await client.publish('my-topic', {
 *   data: { transactionId: '123', amount: 1000 },
 *   attributes: { source: 'webhook' },
 * });
 * console.log('Published message:', result.messageId);
 *
 * // Pull messages from subscription
 * const { messages } = await client.pull('my-subscription', {
 *   maxMessages: 10,
 * });
 *
 * // Process messages
 * for (const message of messages) {
 *   try {
 *     console.log('Processing:', message.data);
 *     // ... process message ...
 *     await client.acknowledge('my-subscription', message.ackId);
 *   } catch (error) {
 *     // Don't acknowledge - message will be redelivered
 *     console.error('Failed to process:', error);
 *   }
 * }
 *
 * // Clean up
 * await client.close();
 * ```
 */

// Errors
export {
  AcknowledgeError,
  MessageDeserializationError,
  MessageSerializationError,
  PubSubApiError,
  PubSubError,
  SubscriptionAlreadyExistsError,
  SubscriptionNotFoundError,
  TopicAlreadyExistsError,
  TopicNotFoundError,
} from './errors.ts';
// Client
export { PubSubClient } from './PubSubClient.ts';

// Types
export type {
  CreateSubscriptionOptions,
  CreateTopicOptions,
  DeadLetterPolicy,
  MessageAttributes,
  PublishMessage,
  PublishResult,
  PubSubClientConfig,
  PullOptions,
  PullResult,
  ReceivedMessage,
  RetryPolicy,
  SubscriptionInfo,
  TopicInfo,
} from './types.ts';
