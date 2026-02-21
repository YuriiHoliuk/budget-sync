/**
 * Categorization Queue Gateway
 *
 * Abstract class defining the interface for enqueuing categorization requests.
 * Push-based delivery (Pub/Sub push subscription) means we only need publish,
 * not pull/acknowledge — those are handled by the push subscription.
 */

/**
 * Injection token for CategorizationQueueGateway.
 * Use with @inject(CATEGORIZATION_QUEUE_GATEWAY_TOKEN) in classes that depend on this gateway.
 */
export const CATEGORIZATION_QUEUE_GATEWAY_TOKEN = Symbol(
  'CategorizationQueueGateway',
);

export abstract class CategorizationQueueGateway {
  /**
   * Publish a categorization request to the queue.
   *
   * @param data - The data to publish (will be JSON-serialized)
   * @returns The message ID assigned by the queue
   */
  abstract publish(data: unknown): Promise<string>;
}
