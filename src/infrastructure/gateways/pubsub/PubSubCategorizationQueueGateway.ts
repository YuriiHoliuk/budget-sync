/**
 * Pub/Sub Categorization Queue Gateway Implementation
 *
 * Implements CategorizationQueueGateway using Google Cloud Pub/Sub.
 * Uses a dedicated topic for categorization requests, separate from
 * the webhook transaction queue.
 */

import { CategorizationQueueGateway } from '@domain/gateways/CategorizationQueueGateway.ts';
import type { PubSubClient } from '@modules/pubsub';
import { inject, injectable } from 'tsyringe';
import { PUBSUB_CLIENT_TOKEN } from './PubSubMessageQueueGateway.ts';

/**
 * Injection token for categorization queue topic name.
 */
export const CATEGORIZATION_TOPIC_TOKEN = Symbol('CategorizationTopic');

@injectable()
export class PubSubCategorizationQueueGateway extends CategorizationQueueGateway {
  constructor(
    @inject(PUBSUB_CLIENT_TOKEN) private readonly pubSubClient: PubSubClient,
    @inject(CATEGORIZATION_TOPIC_TOKEN) private readonly topicName: string,
  ) {
    super();
  }

  async publish(data: unknown): Promise<string> {
    const result = await this.pubSubClient.publish(this.topicName, { data });
    return result.messageId;
  }
}
