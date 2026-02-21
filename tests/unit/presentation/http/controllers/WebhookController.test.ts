import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import type { CategorizeTransactionResultDTO } from '@application/use-cases/CategorizeTransaction.ts';
import type { ProcessIncomingTransactionResultDTO } from '@application/use-cases/ProcessIncomingTransaction.ts';
import type { HttpRequest } from '@modules/http';
import { LLMRateLimitError } from '@modules/llm/index.ts';
import { WebhookController } from '@presentation/http/controllers/WebhookController.ts';
import { createMockLogger } from '../../../helpers';

interface MockEnqueueWebhookTransactionUseCase {
  execute: (payload: unknown) => Promise<{ messageId: string }>;
}

interface MockProcessIncomingTransactionUseCase {
  execute: (
    payload: QueuedWebhookTransactionDTO,
  ) => Promise<ProcessIncomingTransactionResultDTO>;
}

interface MockCategorizeTransactionUseCase {
  execute: (request: {
    transactionDbId: number;
  }) => Promise<CategorizeTransactionResultDTO>;
}

function createMockEnqueueUseCase(
  result: { messageId: string } | Error = { messageId: 'msg-123' },
): MockEnqueueWebhookTransactionUseCase {
  if (result instanceof Error) {
    return {
      execute: mock(() => Promise.reject(result)),
    };
  }
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

function createMockProcessUseCase(
  result: ProcessIncomingTransactionResultDTO | Error = {
    saved: true,
    transactionExternalId: 'tx-123',
  },
): MockProcessIncomingTransactionUseCase {
  if (result instanceof Error) {
    return {
      execute: mock(() => Promise.reject(result)),
    };
  }
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

function createMockCategorizeUseCase(
  result: CategorizeTransactionResultDTO | Error = {
    success: true,
    category: 'Food',
    budget: 'Groceries',
    isNewCategory: false,
  },
): MockCategorizeTransactionUseCase {
  if (result instanceof Error) {
    return {
      execute: mock(() => Promise.reject(result)),
    };
  }
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

/**
 * Creates a valid QueuedWebhookTransactionDTO for testing.
 */
function createValidTransactionDTO(): QueuedWebhookTransactionDTO {
  return {
    accountExternalId: 'account-123',
    newBalanceAmount: 100000,
    newBalanceCurrencyCode: 980,
    transaction: {
      externalId: 'tx-123',
      date: '2024-01-01T12:00:00Z',
      amount: -5000,
      currencyCode: 980,
      operationAmount: -5000,
      operationCurrencyCode: 980,
      description: 'Test transaction',
      type: 'DEBIT',
      mcc: 5411,
      hold: false,
      balanceAmount: 100000,
    },
  };
}

/**
 * Encode string to base64 (supports UTF-8).
 */
function toBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Creates a valid Pub/Sub push message body.
 */
function createPubSubPushBody(
  data: QueuedWebhookTransactionDTO = createValidTransactionDTO(),
): unknown {
  return {
    message: {
      data: toBase64(JSON.stringify(data)),
      messageId: 'pubsub-msg-123',
      publishTime: '2024-01-01T12:00:00Z',
    },
    subscription: 'projects/test-project/subscriptions/test-sub',
  };
}

/**
 * Creates a valid Pub/Sub push message body for categorization.
 */
function createCategorizationPushBody(
  data: { transactionDbId: number } = { transactionDbId: 42 },
): unknown {
  return {
    message: {
      data: toBase64(JSON.stringify(data)),
      messageId: 'cat-msg-123',
      publishTime: '2024-01-01T12:00:00Z',
    },
    subscription: 'projects/test-project/subscriptions/categorization-sub',
  };
}

function createController(
  enqueueUseCase: MockEnqueueWebhookTransactionUseCase = createMockEnqueueUseCase(),
  processUseCase: MockProcessIncomingTransactionUseCase = createMockProcessUseCase(),
  categorizeUseCase: MockCategorizeTransactionUseCase = createMockCategorizeUseCase(),
  logger = createMockLogger(),
): WebhookController {
  return new WebhookController(
    enqueueUseCase as unknown as ConstructorParameters<
      typeof WebhookController
    >[0],
    processUseCase as unknown as ConstructorParameters<
      typeof WebhookController
    >[1],
    categorizeUseCase as unknown as ConstructorParameters<
      typeof WebhookController
    >[2],
    logger,
  );
}

describe('WebhookController', () => {
  describe('handleValidation', () => {
    test('should return 200 OK', () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const response = controller.handleValidation();

      expect(response.status).toBe(200);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook validation request received',
      );
    });
  });

  describe('handleWebhook', () => {
    test('should enqueue transaction and return 200', async () => {
      const mockEnqueueUseCase = createMockEnqueueUseCase({
        messageId: 'msg-456',
      });
      const mockLogger = createMockLogger();
      const controller = createController(
        mockEnqueueUseCase,
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: { type: 'StatementItem', data: {} },
      } as HttpRequest;

      const response = await controller.handleWebhook(request);

      expect(response.status).toBe(200);
      expect(mockEnqueueUseCase.execute).toHaveBeenCalledWith(request.body);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook transaction enqueued',
        { messageId: 'msg-456' },
      );
    });

    test('should return 200 even when use case fails', async () => {
      const mockEnqueueUseCase = createMockEnqueueUseCase(
        new Error('Queue failed'),
      );
      const mockLogger = createMockLogger();
      const controller = createController(
        mockEnqueueUseCase,
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = { body: { invalid: 'payload' } } as HttpRequest;

      const response = await controller.handleWebhook(request);

      expect(response.status).toBe(200);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process webhook',
        expect.objectContaining({ error: 'Queue failed' }),
      );
    });

    test('should log error with stack when available', async () => {
      const errorWithStack = new Error('Processing error');
      const mockEnqueueUseCase = createMockEnqueueUseCase(errorWithStack);
      const mockLogger = createMockLogger();
      const controller = createController(
        mockEnqueueUseCase,
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = { body: {} } as HttpRequest;

      await controller.handleWebhook(request);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process webhook',
        expect.objectContaining({
          error: 'Processing error',
          stack: expect.any(String),
        }),
      );
    });
  });

  describe('handlePubSubPush', () => {
    test('should process valid message and return 200', async () => {
      const mockProcessUseCase = createMockProcessUseCase({
        saved: true,
        transactionExternalId: 'tx-123',
      });
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        mockProcessUseCase,
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: createPubSubPushBody(),
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ processed: true, saved: true });
      expect(mockProcessUseCase.execute).toHaveBeenCalledWith(
        createValidTransactionDTO(),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Pub/Sub message processed',
        expect.objectContaining({
          messageId: 'pubsub-msg-123',
          transactionExternalId: 'tx-123',
          saved: true,
        }),
      );
    });

    test('should return 200 for duplicate transactions', async () => {
      const mockProcessUseCase = createMockProcessUseCase({
        saved: false,
        transactionExternalId: 'tx-123',
      });
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        mockProcessUseCase,
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: createPubSubPushBody(),
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ processed: true, saved: false });
    });

    test('should return 400 for invalid message format - missing message', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: { invalid: 'format' },
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid Pub/Sub push message format',
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid Pub/Sub push message format',
        expect.any(Object),
      );
    });

    test('should return 400 for invalid message format - missing data', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: {
          message: {
            messageId: 'msg-123',
            publishTime: '2024-01-01T12:00:00Z',
          },
          subscription: 'test-sub',
        },
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid Pub/Sub push message format',
      });
    });

    test('should return 400 for invalid base64 data', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: {
          message: {
            data: 'not-valid-base64!!!',
            messageId: 'msg-123',
            publishTime: '2024-01-01T12:00:00Z',
          },
          subscription: 'test-sub',
        },
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid message data' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to decode Pub/Sub message data',
        { messageId: 'msg-123' },
      );
    });

    test('should return 400 for invalid JSON in data', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: {
          message: {
            data: toBase64('not valid json'),
            messageId: 'msg-123',
            publishTime: '2024-01-01T12:00:00Z',
          },
          subscription: 'test-sub',
        },
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid message data' });
    });

    test('should return 400 for invalid transaction DTO structure', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const invalidDto = {
        accountExternalId: 'account-123',
        // Missing required fields
      };

      const request = {
        body: {
          message: {
            data: toBase64(JSON.stringify(invalidDto)),
            messageId: 'msg-123',
            publishTime: '2024-01-01T12:00:00Z',
          },
          subscription: 'test-sub',
        },
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid message data' });
    });

    test('should return 500 on transient error', async () => {
      const mockProcessUseCase = createMockProcessUseCase(
        new Error('Database connection failed'),
      );
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        mockProcessUseCase,
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: createPubSubPushBody(),
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database connection failed' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process Pub/Sub message',
        expect.objectContaining({
          messageId: 'pubsub-msg-123',
          error: 'Database connection failed',
        }),
      );
    });

    test('should return 400 for null body', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: null,
      } as HttpRequest;

      const response = await controller.handlePubSubPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid Pub/Sub push message format',
      });
    });

    test('should decode base64 data correctly', async () => {
      const transactionData = createValidTransactionDTO();
      transactionData.transaction.description = 'Test with UTF-8: привіт 🚀';
      const mockProcessUseCase = createMockProcessUseCase({
        saved: true,
        transactionExternalId: 'tx-123',
      });
      const controller = createController(
        createMockEnqueueUseCase(),
        mockProcessUseCase,
        createMockCategorizeUseCase(),
        createMockLogger(),
      );

      const request = {
        body: createPubSubPushBody(transactionData),
      } as HttpRequest;

      await controller.handlePubSubPush(request);

      expect(mockProcessUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            description: 'Test with UTF-8: привіт 🚀',
          }),
        }),
      );
    });
  });

  describe('handleCategorizationPush', () => {
    test('should process valid categorization message and return 200', async () => {
      const mockCategorizeUseCase = createMockCategorizeUseCase({
        success: true,
        category: 'Food',
        budget: 'Groceries',
        isNewCategory: false,
      });
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        mockCategorizeUseCase,
        mockLogger,
      );

      const request = {
        body: createCategorizationPushBody({ transactionDbId: 42 }),
      } as HttpRequest;

      const response = await controller.handleCategorizationPush(request);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ categorized: true });
      expect(mockCategorizeUseCase.execute).toHaveBeenCalledWith({
        transactionDbId: 42,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Categorization processed',
        expect.objectContaining({
          messageId: 'cat-msg-123',
          transactionDbId: 42,
          category: 'Food',
          budget: 'Groceries',
        }),
      );
    });

    test('should return 500 on rate limit error for Pub/Sub retry', async () => {
      const mockCategorizeUseCase = createMockCategorizeUseCase(
        new LLMRateLimitError(),
      );
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        mockCategorizeUseCase,
        mockLogger,
      );

      const request = {
        body: createCategorizationPushBody({ transactionDbId: 42 }),
      } as HttpRequest;

      const response = await controller.handleCategorizationPush(request);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Rate limited' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Categorization rate-limited, will retry',
        expect.objectContaining({
          messageId: 'cat-msg-123',
          transactionDbId: 42,
        }),
      );
    });

    test('should return 500 on transient error for Pub/Sub retry', async () => {
      const mockCategorizeUseCase = createMockCategorizeUseCase(
        new Error('Database unavailable'),
      );
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        mockCategorizeUseCase,
        mockLogger,
      );

      const request = {
        body: createCategorizationPushBody({ transactionDbId: 42 }),
      } as HttpRequest;

      const response = await controller.handleCategorizationPush(request);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database unavailable' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to categorize transaction',
        expect.objectContaining({
          messageId: 'cat-msg-123',
          transactionDbId: 42,
          error: 'Database unavailable',
        }),
      );
    });

    test('should return 400 for invalid categorization message format', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const request = {
        body: { invalid: 'format' },
      } as HttpRequest;

      const response = await controller.handleCategorizationPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid Pub/Sub push message format',
      });
    });

    test('should return 400 for invalid categorization DTO', async () => {
      const mockLogger = createMockLogger();
      const controller = createController(
        createMockEnqueueUseCase(),
        createMockProcessUseCase(),
        createMockCategorizeUseCase(),
        mockLogger,
      );

      const invalidDto = { invalidField: 'value' };

      const request = {
        body: {
          message: {
            data: toBase64(JSON.stringify(invalidDto)),
            messageId: 'msg-123',
            publishTime: '2024-01-01T12:00:00Z',
          },
          subscription: 'test-sub',
        },
      } as HttpRequest;

      const response = await controller.handleCategorizationPush(request);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid message data' });
    });
  });

  describe('handleHealthCheck', () => {
    test('should return healthy status', () => {
      const controller = createController();

      const response = controller.handleHealthCheck();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  describe('routes', () => {
    test('should define correct routes', () => {
      const controller = createController();

      expect(controller.prefix).toBe('/webhook');
      expect(controller.routes).toEqual([
        { method: 'get', path: '', handler: 'handleValidation' },
        { method: 'post', path: '', handler: 'handleWebhook' },
        { method: 'post', path: '/process', handler: 'handlePubSubPush' },
        {
          method: 'post',
          path: '/categorize',
          handler: 'handleCategorizationPush',
        },
        { method: 'get', path: '/health', handler: 'handleHealthCheck' },
      ]);
    });
  });
});
