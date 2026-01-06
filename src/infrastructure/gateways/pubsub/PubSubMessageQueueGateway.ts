/**
 * Pub/Sub Message Queue Gateway Implementation
 *
 * Implements MessageQueueGateway using Google Cloud Pub/Sub.
 */

import {
  MessageQueueGateway,
  type QueueMessage,
} from '@domain/gateways/MessageQueueGateway.ts';
import type { PubSubClient } from '@modules/pubsub';
import { inject, injectable } from 'tsyringe';
import type { PubSubQueueConfig } from './types.ts';

/**
 * Injection token for PubSubQueueConfig.
 * Use with @inject(PUBSUB_QUEUE_CONFIG_TOKEN) in classes that depend on PubSubQueueConfig.
 */
export const PUBSUB_QUEUE_CONFIG_TOKEN = Symbol('PubSubQueueConfig');

/**
 * Injection token for PubSubClient.
 * Use with @inject(PUBSUB_CLIENT_TOKEN) in classes that depend on PubSubClient.
 */
export const PUBSUB_CLIENT_TOKEN = Symbol('PubSubClient');

@injectable()
export class PubSubMessageQueueGateway extends MessageQueueGateway {
  private readonly topicName: string;
  private readonly subscriptionName: string;

  constructor(
    @inject(PUBSUB_CLIENT_TOKEN) private readonly pubSubClient: PubSubClient,
    @inject(PUBSUB_QUEUE_CONFIG_TOKEN) config: PubSubQueueConfig,
  ) {
    super();
    this.topicName = config.topicName;
    this.subscriptionName = config.subscriptionName;
  }

  async publish(data: unknown): Promise<string> {
    const result = await this.pubSubClient.publish(this.topicName, { data });
    return result.messageId;
  }

  async pull(maxMessages = 10): Promise<QueueMessage[]> {
    const result = await this.pubSubClient.pull(this.subscriptionName, {
      maxMessages,
    });

    return result.messages.map((message) => ({
      ackId: message.ackId,
      messageId: message.messageId,
      data: message.data,
      publishTime: message.publishTime,
      deliveryAttempt: message.deliveryAttempt,
    }));
  }

  async acknowledge(ackId: string): Promise<void> {
    await this.pubSubClient.acknowledge(this.subscriptionName, ackId);
  }
}
