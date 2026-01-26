import type { z } from 'zod';
import {
  type PubSubParseResult,
  type PubSubPushMessage,
  pubSubPushMessageSchema,
} from './types.ts';

/**
 * Parser for Google Cloud Pub/Sub push messages.
 *
 * Handles the two-step parsing process:
 * 1. Validate the Pub/Sub envelope format
 * 2. Decode base64 data and validate against a provided schema
 *
 * @example
 * ```typescript
 * const parser = new PubSubPushParser();
 * const result = parser.parse(request.body, myDataSchema);
 *
 * if (!result.success) {
 *   return result.error === 'invalid_envelope'
 *     ? badRequest('Invalid Pub/Sub message format')
 *     : badRequest('Invalid message data');
 * }
 *
 * // result.data is typed according to myDataSchema
 * // result.messageId is available for logging
 * ```
 */
export class PubSubPushParser {
  /**
   * Parse a Pub/Sub push message and decode its data.
   *
   * @param body - Raw request body from Pub/Sub push
   * @param dataSchema - Zod schema to validate the decoded message data
   * @returns Parse result with typed data or error indication
   */
  parse<T>(body: unknown, dataSchema: z.ZodSchema<T>): PubSubParseResult<T> {
    const envelope = this.parseEnvelope(body);
    if (!envelope) {
      return { success: false, error: 'invalid_envelope' };
    }

    const messageId = envelope.message.messageId;
    const data = this.decodeData(envelope, dataSchema);
    if (!data) {
      return { success: false, error: 'invalid_data', messageId };
    }

    return {
      success: true,
      data,
      messageId,
    };
  }

  /**
   * Parse and validate the Pub/Sub push message envelope.
   */
  private parseEnvelope(body: unknown): PubSubPushMessage | null {
    const result = pubSubPushMessageSchema.safeParse(body);
    return result.success ? result.data : null;
  }

  /**
   * Decode base64 message data and validate against schema.
   * Uses Buffer for proper UTF-8 support.
   */
  private decodeData<T>(
    envelope: PubSubPushMessage,
    schema: z.ZodSchema<T>,
  ): T | null {
    try {
      const decoded = Buffer.from(envelope.message.data, 'base64').toString(
        'utf-8',
      );
      const parsed = JSON.parse(decoded) as unknown;
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}
