/**
 * Pub/Sub module errors
 */

/** Base error for all Pub/Sub-related errors */
export class PubSubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PubSubError';
  }
}

/** Error when a topic is not found */
export class TopicNotFoundError extends PubSubError {
  constructor(public readonly topicName: string) {
    super(`Topic "${topicName}" not found`);
    this.name = 'TopicNotFoundError';
  }
}

/** Error when a subscription is not found */
export class SubscriptionNotFoundError extends PubSubError {
  constructor(public readonly subscriptionName: string) {
    super(`Subscription "${subscriptionName}" not found`);
    this.name = 'SubscriptionNotFoundError';
  }
}

/** Error when Pub/Sub API returns an error */
export class PubSubApiError extends PubSubError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly grpcCode?: number,
  ) {
    super(message);
    this.name = 'PubSubApiError';
  }
}

/** Error when message serialization fails */
export class MessageSerializationError extends PubSubError {
  constructor(message: string) {
    super(`Failed to serialize message: ${message}`);
    this.name = 'MessageSerializationError';
  }
}

/** Error when message deserialization fails */
export class MessageDeserializationError extends PubSubError {
  public readonly pubsubMessageId: string;
  public readonly errorCause: string;

  constructor(messageId: string, cause: string) {
    super(`Failed to deserialize message ${messageId}: ${cause}`);
    this.name = 'MessageDeserializationError';
    this.pubsubMessageId = messageId;
    this.errorCause = cause;
  }
}

/** Error when acknowledging a message fails */
export class AcknowledgeError extends PubSubError {
  public readonly ackId: string;
  public readonly errorCause: string;

  constructor(ackId: string, cause: string) {
    super(`Failed to acknowledge message ${ackId}: ${cause}`);
    this.name = 'AcknowledgeError';
    this.ackId = ackId;
    this.errorCause = cause;
  }
}

/** Error when the topic already exists */
export class TopicAlreadyExistsError extends PubSubError {
  constructor(public readonly topicName: string) {
    super(`Topic "${topicName}" already exists`);
    this.name = 'TopicAlreadyExistsError';
  }
}

/** Error when the subscription already exists */
export class SubscriptionAlreadyExistsError extends PubSubError {
  constructor(public readonly subscriptionName: string) {
    super(`Subscription "${subscriptionName}" already exists`);
    this.name = 'SubscriptionAlreadyExistsError';
  }
}
