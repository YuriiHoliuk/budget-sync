/**
 * PubSubClient - Low-level client for Google Cloud Pub/Sub
 *
 * Provides basic operations for publishing and pulling messages.
 * This is a business-agnostic wrapper around the Google Cloud Pub/Sub client.
 *
 * Uses the v1 SubscriberClient for synchronous pull operations, which is
 * suitable for batch processing in Cloud Run Jobs.
 */

import { PubSub, v1 } from '@google-cloud/pubsub';
import {
  AcknowledgeError,
  MessageDeserializationError,
  MessageSerializationError,
  PubSubApiError,
  SubscriptionAlreadyExistsError,
  SubscriptionNotFoundError,
  TopicAlreadyExistsError,
  TopicNotFoundError,
} from './errors.ts';
import type {
  CreateSubscriptionOptions,
  CreateTopicOptions,
  PublishMessage,
  PublishResult,
  PubSubClientConfig,
  PullOptions,
  PullResult,
  ReceivedMessage,
  SubscriptionInfo,
  TopicInfo,
} from './types.ts';

/** gRPC status codes */
const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;

export class PubSubClient {
  private pubsub: PubSub | null = null;
  private subscriberClient: v1.SubscriberClient | null = null;
  private readonly projectId?: string;
  private readonly serviceAccountFile?: string;

  constructor(config: PubSubClientConfig = {}) {
    this.projectId = config.projectId;
    this.serviceAccountFile = config.serviceAccountFile;
  }

  /**
   * Initialize the high-level Pub/Sub client (for topics and publishing)
   */
  private getPubSub(): PubSub {
    if (this.pubsub) {
      return this.pubsub;
    }

    const options: { projectId?: string; keyFilename?: string } = {};

    if (this.projectId) {
      options.projectId = this.projectId;
    }

    if (this.serviceAccountFile) {
      options.keyFilename = this.serviceAccountFile;
    }

    this.pubsub = new PubSub(options);
    return this.pubsub;
  }

  /**
   * Initialize the v1 SubscriberClient (for synchronous pull operations)
   */
  private getSubscriberClient(): v1.SubscriberClient {
    if (this.subscriberClient) {
      return this.subscriberClient;
    }

    const options: { projectId?: string; keyFilename?: string } = {};

    if (this.projectId) {
      options.projectId = this.projectId;
    }

    if (this.serviceAccountFile) {
      options.keyFilename = this.serviceAccountFile;
    }

    this.subscriberClient = new v1.SubscriberClient(options);
    return this.subscriberClient;
  }

  /**
   * Get project ID (resolved from config or ADC)
   */
  private async getProjectId(): Promise<string> {
    if (this.projectId) {
      return this.projectId;
    }
    const pubsub = this.getPubSub();
    // Wait for project ID resolution
    await pubsub.getClientConfig();
    return pubsub.projectId;
  }

  /**
   * Format full subscription name from short name
   */
  private async formatSubscriptionName(
    subscriptionName: string,
  ): Promise<string> {
    if (subscriptionName.startsWith('projects/')) {
      return subscriptionName;
    }
    const projectId = await this.getProjectId();
    return `projects/${projectId}/subscriptions/${subscriptionName}`;
  }

  /**
   * Wraps API calls with error handling
   */
  private async withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.convertError(error);
    }
  }

  /**
   * Convert library error to module-specific error
   */
  private convertError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new PubSubApiError(String(error));
    }

    const grpcCode = this.extractGrpcCode(error);
    const errorMessage = error.message;

    const notFoundError = this.convertNotFoundError(grpcCode, errorMessage);
    if (notFoundError) {
      return notFoundError;
    }

    const alreadyExistsError = this.convertAlreadyExistsError(
      grpcCode,
      errorMessage,
    );
    if (alreadyExistsError) {
      return alreadyExistsError;
    }

    return new PubSubApiError(errorMessage, undefined, grpcCode);
  }

  /**
   * Convert NOT_FOUND gRPC error to specific error type
   */
  private convertNotFoundError(
    grpcCode: number | undefined,
    message: string,
  ): Error | null {
    if (grpcCode !== GRPC_NOT_FOUND) {
      return null;
    }
    if (message.includes('Topic')) {
      return new TopicNotFoundError(this.extractResourceName(message, 'Topic'));
    }
    if (message.includes('Subscription')) {
      return new SubscriptionNotFoundError(
        this.extractResourceName(message, 'Subscription'),
      );
    }
    return null;
  }

  /**
   * Convert ALREADY_EXISTS gRPC error to specific error type
   */
  private convertAlreadyExistsError(
    grpcCode: number | undefined,
    message: string,
  ): Error | null {
    if (grpcCode !== GRPC_ALREADY_EXISTS) {
      return null;
    }
    if (message.includes('Topic')) {
      return new TopicAlreadyExistsError(
        this.extractResourceName(message, 'Topic'),
      );
    }
    if (message.includes('Subscription')) {
      return new SubscriptionAlreadyExistsError(
        this.extractResourceName(message, 'Subscription'),
      );
    }
    return null;
  }

  /**
   * Extract gRPC code from error
   */
  private extractGrpcCode(
    error: Error & { code?: unknown },
  ): number | undefined {
    const code = error.code;
    return typeof code === 'number' ? code : undefined;
  }

  /**
   * Extract resource name from error message
   */
  private extractResourceName(message: string, resourceType: string): string {
    const match = message.match(
      new RegExp(`${resourceType}[:\\s]+(\\S+)`, 'i'),
    );
    return match?.[1] ?? 'unknown';
  }

  /**
   * Serialize message data to Buffer
   */
  private serializeData(data: unknown): Buffer {
    try {
      const jsonString = JSON.stringify(data);
      return Buffer.from(jsonString);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown serialization error';
      throw new MessageSerializationError(errorMessage);
    }
  }

  /**
   * Deserialize message data from Buffer, Uint8Array, or string
   */
  private deserializeData(
    data: Buffer | Uint8Array | string,
    messageId: string,
  ): unknown {
    try {
      let jsonString: string;
      if (typeof data === 'string') {
        jsonString = data;
      } else if (Buffer.isBuffer(data)) {
        jsonString = data.toString('utf-8');
      } else {
        jsonString = Buffer.from(data).toString('utf-8');
      }
      return JSON.parse(jsonString);
    } catch (error) {
      const cause =
        error instanceof Error
          ? error.message
          : 'Unknown deserialization error';
      throw new MessageDeserializationError(messageId, cause);
    }
  }

  // ========== Topic Operations ==========

  /**
   * Create a new topic
   */
  createTopic(
    topicName: string,
    options: CreateTopicOptions = {},
  ): Promise<TopicInfo> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const [topic] = await pubsub.createTopic({
        name: topicName,
        labels: options.labels,
      });

      return {
        name: topic.name,
        labels: {},
      };
    });
  }

  /**
   * Delete a topic
   */
  deleteTopic(topicName: string): Promise<void> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const topic = pubsub.topic(topicName);
      await topic.delete();
    });
  }

  /**
   * Check if a topic exists
   */
  async topicExists(topicName: string): Promise<boolean> {
    try {
      const pubsub = this.getPubSub();
      const topic = pubsub.topic(topicName);
      const [exists] = await topic.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get topic information
   */
  getTopicInfo(topicName: string): Promise<TopicInfo> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const topic = pubsub.topic(topicName);
      const [metadata] = await topic.getMetadata();

      return {
        name: metadata.name ?? topicName,
        labels: (metadata.labels as Record<string, string>) ?? {},
      };
    });
  }

  // ========== Subscription Operations ==========

  /**
   * Create a new subscription for a topic
   */
  createSubscription(
    topicName: string,
    subscriptionName: string,
    options: CreateSubscriptionOptions = {},
  ): Promise<SubscriptionInfo> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const subscriptionOptions = this.buildSubscriptionOptions(options);

      const [subscription] = await pubsub.createSubscription(
        topicName,
        subscriptionName,
        subscriptionOptions,
      );

      const metadata = subscription.metadata;

      return {
        name: metadata?.name ?? subscriptionName,
        topic: metadata?.topic?.toString() ?? topicName,
        ackDeadlineSeconds: metadata?.ackDeadlineSeconds ?? 60,
        labels: (metadata?.labels as Record<string, string>) ?? {},
      };
    });
  }

  /**
   * Build subscription options from CreateSubscriptionOptions
   */
  private buildSubscriptionOptions(
    options: CreateSubscriptionOptions,
  ): Record<string, unknown> {
    const subscriptionOptions: Record<string, unknown> = {};

    if (options.ackDeadlineSeconds !== undefined) {
      subscriptionOptions['ackDeadlineSeconds'] = options.ackDeadlineSeconds;
    }

    if (options.messageRetentionDuration !== undefined) {
      subscriptionOptions['messageRetentionDuration'] = {
        seconds: options.messageRetentionDuration,
      };
    }

    if (options.deadLetterPolicy) {
      subscriptionOptions['deadLetterPolicy'] = {
        deadLetterTopic: options.deadLetterPolicy.deadLetterTopic,
        maxDeliveryAttempts: options.deadLetterPolicy.maxDeliveryAttempts ?? 5,
      };
    }

    if (options.retryPolicy) {
      subscriptionOptions['retryPolicy'] = {
        minimumBackoff: {
          seconds: options.retryPolicy.minimumBackoff ?? 10,
        },
        maximumBackoff: {
          seconds: options.retryPolicy.maximumBackoff ?? 600,
        },
      };
    }

    if (options.labels) {
      subscriptionOptions['labels'] = options.labels;
    }

    return subscriptionOptions;
  }

  /**
   * Delete a subscription
   */
  deleteSubscription(subscriptionName: string): Promise<void> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const subscription = pubsub.subscription(subscriptionName);
      await subscription.delete();
    });
  }

  /**
   * Check if a subscription exists
   */
  async subscriptionExists(subscriptionName: string): Promise<boolean> {
    try {
      const pubsub = this.getPubSub();
      const subscription = pubsub.subscription(subscriptionName);
      const [exists] = await subscription.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get subscription information
   */
  getSubscriptionInfo(subscriptionName: string): Promise<SubscriptionInfo> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const subscription = pubsub.subscription(subscriptionName);
      const [metadata] = await subscription.getMetadata();

      return {
        name: metadata.name ?? subscriptionName,
        topic: metadata.topic?.toString() ?? '',
        ackDeadlineSeconds: metadata.ackDeadlineSeconds ?? 60,
        labels: (metadata.labels as Record<string, string>) ?? {},
      };
    });
  }

  // ========== Publishing ==========

  /**
   * Publish a single message to a topic
   */
  publish(topicName: string, message: PublishMessage): Promise<PublishResult> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const topic = pubsub.topic(topicName);
      const dataBuffer = this.serializeData(message.data);

      const messageId = await topic.publishMessage({
        data: dataBuffer,
        attributes: message.attributes,
        orderingKey: message.orderingKey,
      });

      return { messageId };
    });
  }

  /**
   * Publish multiple messages to a topic
   */
  publishBatch(
    topicName: string,
    messages: PublishMessage[],
  ): Promise<PublishResult[]> {
    return this.withErrorHandling(async () => {
      const pubsub = this.getPubSub();
      const topic = pubsub.topic(topicName);

      const publishPromises = messages.map(async (message) => {
        const dataBuffer = this.serializeData(message.data);
        const messageId = await topic.publishMessage({
          data: dataBuffer,
          attributes: message.attributes,
          orderingKey: message.orderingKey,
        });
        return { messageId };
      });

      return await Promise.all(publishPromises);
    });
  }

  // ========== Pulling (using v1 SubscriberClient) ==========

  /**
   * Pull messages from a subscription (synchronous pull)
   *
   * This method performs a synchronous pull operation using the v1 SubscriberClient,
   * which is suitable for batch processing scenarios like Cloud Run Jobs.
   */
  pull(
    subscriptionName: string,
    options: PullOptions = {},
  ): Promise<PullResult> {
    return this.withErrorHandling(async () => {
      const client = this.getSubscriberClient();
      const formattedName = await this.formatSubscriptionName(subscriptionName);

      const maxMessages = options.maxMessages ?? 10;

      const [response] = await client.pull({
        subscription: formattedName,
        maxMessages,
        returnImmediately: options.returnImmediately ?? true,
      });

      const receivedMessages = response.receivedMessages ?? [];

      const messages: ReceivedMessage[] = receivedMessages.map(
        (receivedMessage): ReceivedMessage =>
          this.mapReceivedMessage(receivedMessage),
      );

      return { messages };
    });
  }

  /**
   * Map a Pub/Sub received message to our ReceivedMessage type
   */
  private mapReceivedMessage(receivedMessage: {
    ackId?: string | null;
    message?: {
      messageId?: string | null;
      data?: Uint8Array | string | null;
      attributes?: Record<string, string> | null;
      publishTime?: {
        seconds?: number | string | Long | null;
        nanos?: number | null;
      } | null;
      orderingKey?: string | null;
    } | null;
    deliveryAttempt?: number | null;
  }): ReceivedMessage {
    const pubsubMessage = receivedMessage.message;
    const messageId = pubsubMessage?.messageId ?? '';
    const dataBuffer = pubsubMessage?.data ?? Buffer.from('');

    return {
      ackId: receivedMessage.ackId ?? '',
      messageId,
      data: this.deserializeData(dataBuffer, messageId),
      attributes: (pubsubMessage?.attributes as Record<string, string>) ?? {},
      publishTime: pubsubMessage?.publishTime
        ? this.parseTimestamp(pubsubMessage.publishTime)
        : new Date(),
      deliveryAttempt: receivedMessage.deliveryAttempt ?? 1,
      orderingKey: pubsubMessage?.orderingKey ?? undefined,
    };
  }

  /**
   * Parse Pub/Sub timestamp to Date
   */
  private parseTimestamp(
    timestamp: {
      seconds?: number | string | Long | null;
      nanos?: number | null;
    } | null,
  ): Date {
    if (!timestamp) {
      return new Date();
    }
    const seconds = timestamp.seconds;
    const nanos = timestamp.nanos ?? 0;

    const secondsNum = this.parseSeconds(seconds);
    return new Date(secondsNum * 1000 + nanos / 1000000);
  }

  /**
   * Parse seconds value which can be number, string, or Long
   */
  private parseSeconds(
    seconds: number | string | Long | null | undefined,
  ): number {
    if (typeof seconds === 'number') {
      return seconds;
    }
    if (typeof seconds === 'string') {
      return Number.parseInt(seconds, 10);
    }
    if (seconds && typeof seconds === 'object' && 'toNumber' in seconds) {
      return (seconds as { toNumber(): number }).toNumber();
    }
    return 0;
  }

  // ========== Acknowledgment (using v1 SubscriberClient) ==========

  /**
   * Acknowledge a message (mark as processed)
   *
   * After acknowledgment, the message will not be redelivered.
   */
  acknowledge(subscriptionName: string, ackId: string): Promise<void> {
    return this.withErrorHandling(async () => {
      const client = this.getSubscriberClient();
      const formattedName = await this.formatSubscriptionName(subscriptionName);

      try {
        await client.acknowledge({
          subscription: formattedName,
          ackIds: [ackId],
        });
      } catch (error) {
        const cause = error instanceof Error ? error.message : 'Unknown error';
        throw new AcknowledgeError(ackId, cause);
      }
    });
  }

  /**
   * Acknowledge multiple messages at once
   */
  acknowledgeBatch(subscriptionName: string, ackIds: string[]): Promise<void> {
    if (ackIds.length === 0) {
      return Promise.resolve();
    }

    return this.withErrorHandling(async () => {
      const client = this.getSubscriberClient();
      const formattedName = await this.formatSubscriptionName(subscriptionName);

      await client.acknowledge({
        subscription: formattedName,
        ackIds,
      });
    });
  }

  /**
   * Modify the acknowledgment deadline for a message
   *
   * Use this to extend the processing time for a message
   * if you need more time to process it.
   */
  modifyAckDeadline(
    subscriptionName: string,
    ackId: string,
    ackDeadlineSeconds: number,
  ): Promise<void> {
    return this.withErrorHandling(async () => {
      const client = this.getSubscriberClient();
      const formattedName = await this.formatSubscriptionName(subscriptionName);

      await client.modifyAckDeadline({
        subscription: formattedName,
        ackIds: [ackId],
        ackDeadlineSeconds,
      });
    });
  }

  /**
   * Modify the acknowledgment deadline for multiple messages
   */
  modifyAckDeadlineBatch(
    subscriptionName: string,
    ackIds: string[],
    ackDeadlineSeconds: number,
  ): Promise<void> {
    if (ackIds.length === 0) {
      return Promise.resolve();
    }

    return this.withErrorHandling(async () => {
      const client = this.getSubscriberClient();
      const formattedName = await this.formatSubscriptionName(subscriptionName);

      await client.modifyAckDeadline({
        subscription: formattedName,
        ackIds,
        ackDeadlineSeconds,
      });
    });
  }

  // ========== Cleanup ==========

  /**
   * Close the client and release resources
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.pubsub) {
      closePromises.push(this.pubsub.close());
      this.pubsub = null;
    }

    if (this.subscriberClient) {
      closePromises.push(this.subscriberClient.close());
      this.subscriberClient = null;
    }

    await Promise.all(closePromises);
  }
}

// Type for Long (from google-protobuf)
interface Long {
  toNumber(): number;
}
