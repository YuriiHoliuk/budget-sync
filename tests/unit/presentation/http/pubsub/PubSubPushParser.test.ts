import { describe, expect, test } from 'bun:test';
import { PubSubPushParser } from '@presentation/http/pubsub/PubSubPushParser.ts';
import { z } from 'zod';

/**
 * Encode string to base64 (supports UTF-8).
 */
function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Test schema for message data.
 */
const testDataSchema = z.object({
  id: z.string(),
  value: z.number(),
  message: z.string().optional(),
});

type TestData = z.infer<typeof testDataSchema>;

/**
 * Creates a valid Pub/Sub push message envelope.
 */
function createValidEnvelope(data: TestData): unknown {
  return {
    message: {
      data: toBase64(JSON.stringify(data)),
      messageId: 'msg-123',
      publishTime: '2024-01-01T12:00:00Z',
    },
    subscription: 'projects/test-project/subscriptions/test-sub',
  };
}

describe('PubSubPushParser', () => {
  const parser = new PubSubPushParser();

  describe('parse', () => {
    test('should parse valid message successfully', () => {
      const testData: TestData = { id: 'test-1', value: 42 };
      const envelope = createValidEnvelope(testData);

      const result = parser.parse(envelope, testDataSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(testData);
        expect(result.messageId).toBe('msg-123');
      }
    });

    test('should parse message with optional fields', () => {
      const testData: TestData = {
        id: 'test-2',
        value: 100,
        message: 'Hello world',
      };
      const envelope = createValidEnvelope(testData);

      const result = parser.parse(envelope, testDataSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('Hello world');
      }
    });

    test('should handle UTF-8 characters in data', () => {
      const testData: TestData = {
        id: 'test-utf8',
        value: 0,
        message: 'Привіт світ 🌍',
      };
      const envelope = createValidEnvelope(testData);

      const result = parser.parse(envelope, testDataSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('Привіт світ 🌍');
      }
    });

    test('should return invalid_envelope for null body', () => {
      const result = parser.parse(null, testDataSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_envelope');
      }
    });

    test('should return invalid_envelope for undefined body', () => {
      const result = parser.parse(undefined, testDataSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_envelope');
      }
    });

    test('should return invalid_envelope for missing message field', () => {
      const result = parser.parse({ subscription: 'test-sub' }, testDataSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_envelope');
      }
    });

    test('should return invalid_envelope for missing data field', () => {
      const result = parser.parse(
        {
          message: {
            messageId: 'msg-123',
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_envelope');
      }
    });

    test('should return invalid_envelope for missing messageId', () => {
      const result = parser.parse(
        {
          message: {
            data: toBase64('{}'),
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_envelope');
      }
    });

    test('should return invalid_data for invalid base64', () => {
      const result = parser.parse(
        {
          message: {
            data: 'not-valid-base64!!!',
            messageId: 'msg-456',
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success && result.error === 'invalid_data') {
        expect(result.messageId).toBe('msg-456');
      }
    });

    test('should return invalid_data for invalid JSON', () => {
      const result = parser.parse(
        {
          message: {
            data: toBase64('not valid json'),
            messageId: 'msg-789',
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success && result.error === 'invalid_data') {
        expect(result.messageId).toBe('msg-789');
      }
    });

    test('should return invalid_data when data does not match schema', () => {
      const invalidData = { id: 123, value: 'not-a-number' }; // Wrong types

      const result = parser.parse(
        {
          message: {
            data: toBase64(JSON.stringify(invalidData)),
            messageId: 'msg-schema',
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success && result.error === 'invalid_data') {
        expect(result.messageId).toBe('msg-schema');
      }
    });

    test('should return invalid_data for missing required fields', () => {
      const incompleteData = { id: 'test' }; // Missing required 'value' field

      const result = parser.parse(
        {
          message: {
            data: toBase64(JSON.stringify(incompleteData)),
            messageId: 'msg-incomplete',
            publishTime: '2024-01-01T00:00:00Z',
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(false);
      if (!result.success && result.error === 'invalid_data') {
        expect(result.messageId).toBe('msg-incomplete');
      }
    });

    test('should parse envelope with optional attributes field', () => {
      const testData: TestData = { id: 'test-attrs', value: 1 };

      const result = parser.parse(
        {
          message: {
            data: toBase64(JSON.stringify(testData)),
            messageId: 'msg-attrs',
            publishTime: '2024-01-01T00:00:00Z',
            attributes: { key1: 'value1', key2: 'value2' },
          },
          subscription: 'test-sub',
        },
        testDataSchema,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(testData);
      }
    });
  });
});
