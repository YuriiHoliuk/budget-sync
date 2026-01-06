/**
 * Pub/Sub Message Queue Gateway Types
 *
 * Types specific to the Pub/Sub implementation of MessageQueueGateway.
 */

/**
 * Configuration for the PubSubMessageQueueGateway
 */
export interface PubSubQueueConfig {
  /** The topic name to publish messages to */
  topicName: string;
  /** The subscription name to pull messages from */
  subscriptionName: string;
}
