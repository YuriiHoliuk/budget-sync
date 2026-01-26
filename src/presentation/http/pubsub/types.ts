import { z } from 'zod';

/**
 * Zod schema for Pub/Sub push message format.
 * When Pub/Sub delivers a message via push, it wraps the data in this envelope.
 *
 * @see https://cloud.google.com/pubsub/docs/push#receive_push
 */
export const pubSubPushMessageSchema = z.object({
  message: z.object({
    /** Base64-encoded message data */
    data: z.string(),
    /** Unique message ID from Pub/Sub */
    messageId: z.string(),
    /** ISO 8601 timestamp when the message was published */
    publishTime: z.string(),
    /** Optional message attributes */
    attributes: z.record(z.string(), z.string()).optional(),
  }),
  /** Full subscription name (projects/PROJECT/subscriptions/NAME) */
  subscription: z.string(),
});

/**
 * Pub/Sub push message envelope type.
 */
export type PubSubPushMessage = z.infer<typeof pubSubPushMessageSchema>;

/**
 * Result of parsing a Pub/Sub push message.
 *
 * On success: returns parsed data and messageId
 * On invalid_envelope: no additional info (envelope couldn't be parsed)
 * On invalid_data: includes messageId for debugging (envelope was valid)
 */
export type PubSubParseResult<T> =
  | { success: true; data: T; messageId: string }
  | { success: false; error: 'invalid_envelope' }
  | { success: false; error: 'invalid_data'; messageId: string };
