/**
 * Pub/Sub module types
 * Business-agnostic types for working with Google Cloud Pub/Sub
 */

/**
 * Message attributes - key-value pairs attached to a message
 */
export type MessageAttributes = Record<string, string>;

/**
 * A message to be published to a topic
 */
export interface PublishMessage {
  /** JSON-serializable data to publish */
  data: unknown;
  /** Optional attributes for filtering/routing */
  attributes?: MessageAttributes;
  /** Optional ordering key for ordered delivery */
  orderingKey?: string;
}

/**
 * Result of a publish operation
 */
export interface PublishResult {
  /** The message ID assigned by Pub/Sub */
  messageId: string;
}

/**
 * A message received from a subscription
 */
export interface ReceivedMessage {
  /** Unique acknowledgment ID for this delivery */
  ackId: string;
  /** The message ID */
  messageId: string;
  /** The message data as a JSON-parsed object */
  data: unknown;
  /** Message attributes */
  attributes: MessageAttributes;
  /** When the message was published */
  publishTime: Date;
  /** How many times this message has been delivered */
  deliveryAttempt: number;
  /** Optional ordering key if the message was published with one */
  orderingKey?: string;
}

/**
 * Options for pulling messages from a subscription
 */
export interface PullOptions {
  /** Maximum number of messages to return (default: 10) */
  maxMessages?: number;
  /** Return immediately even if no messages are available (default: true) */
  returnImmediately?: boolean;
}

/**
 * Result of a pull operation
 */
export interface PullResult {
  /** Messages received from the subscription */
  messages: ReceivedMessage[];
}

/**
 * Configuration for the PubSubClient
 */
export interface PubSubClientConfig {
  /** Google Cloud project ID (uses ADC default if not specified) */
  projectId?: string;
  /**
   * Path to Google service account JSON file.
   * If not provided, uses Application Default Credentials (ADC).
   * ADC works automatically on Google Cloud (Cloud Run, GCE, etc.).
   */
  serviceAccountFile?: string;
}

/**
 * Options for creating a topic
 */
export interface CreateTopicOptions {
  /** Labels to apply to the topic */
  labels?: Record<string, string>;
}

/**
 * Options for creating a subscription
 */
export interface CreateSubscriptionOptions {
  /** How long (in seconds) to wait for acknowledgment before redelivering (default: 60) */
  ackDeadlineSeconds?: number;
  /** How long (in seconds) to retain unacknowledged messages (default: 7 days) */
  messageRetentionDuration?: number;
  /** Dead letter policy for failed messages */
  deadLetterPolicy?: DeadLetterPolicy;
  /** Retry policy for redelivering messages */
  retryPolicy?: RetryPolicy;
  /** Labels to apply to the subscription */
  labels?: Record<string, string>;
}

/**
 * Dead letter policy configuration
 */
export interface DeadLetterPolicy {
  /** The topic to send dead-lettered messages to */
  deadLetterTopic: string;
  /** Max delivery attempts before sending to dead letter topic (default: 5) */
  maxDeliveryAttempts?: number;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Minimum backoff delay in seconds (default: 10) */
  minimumBackoff?: number;
  /** Maximum backoff delay in seconds (default: 600) */
  maximumBackoff?: number;
}

/**
 * Information about a topic
 */
export interface TopicInfo {
  /** Full resource name of the topic */
  name: string;
  /** Labels attached to the topic */
  labels: Record<string, string>;
}

/**
 * Information about a subscription
 */
export interface SubscriptionInfo {
  /** Full resource name of the subscription */
  name: string;
  /** The topic this subscription is attached to */
  topic: string;
  /** Acknowledgment deadline in seconds */
  ackDeadlineSeconds: number;
  /** Labels attached to the subscription */
  labels: Record<string, string>;
}
