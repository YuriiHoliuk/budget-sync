/**
 * Message Queue Gateway
 *
 * Abstract class defining the interface for message queue operations.
 * Implementations can use different message queue providers (Pub/Sub, SQS, etc.)
 */

/**
 * A message received from the queue
 */
export interface QueueMessage<TData = unknown> {
  /** Unique acknowledgment ID for this delivery */
  ackId: string;
  /** The message ID */
  messageId: string;
  /** The message data */
  data: TData;
  /** When the message was published */
  publishTime: Date;
  /** How many times this message has been delivered */
  deliveryAttempt: number;
}

/**
 * Injection token for MessageQueueGateway.
 * Use with @inject(MESSAGE_QUEUE_GATEWAY_TOKEN) in classes that depend on MessageQueueGateway.
 */
export const MESSAGE_QUEUE_GATEWAY_TOKEN = Symbol('MessageQueueGateway');

export abstract class MessageQueueGateway {
  /**
   * Publish a message to the queue
   *
   * @param data - The data to publish (will be JSON-serialized)
   * @returns The message ID assigned by the queue
   */
  abstract publish(data: unknown): Promise<string>;

  /**
   * Pull messages from the queue
   *
   * @param maxMessages - Maximum number of messages to pull (default: 10)
   * @returns Array of messages with their data and acknowledgment IDs
   */
  abstract pull(maxMessages?: number): Promise<QueueMessage[]>;

  /**
   * Acknowledge a message as processed
   *
   * After acknowledgment, the message will not be redelivered.
   *
   * @param ackId - The acknowledgment ID of the message to acknowledge
   */
  abstract acknowledge(ackId: string): Promise<void>;
}
