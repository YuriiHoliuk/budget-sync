import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { HttpRequest } from '@modules/http';
import { WebhookController } from '@presentation/http/controllers/WebhookController.ts';
import { createMockLogger } from '../../../helpers';

interface MockEnqueueWebhookTransactionUseCase {
  execute: (payload: unknown) => Promise<{ messageId: string }>;
}

function createMockUseCase(
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

describe('WebhookController', () => {
  describe('handleValidation', () => {
    test('should return 200 OK', () => {
      const mockUseCase = createMockUseCase();
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
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
      const mockUseCase = createMockUseCase({ messageId: 'msg-456' });
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
        mockLogger,
      );

      const request = {
        body: { type: 'StatementItem', data: {} },
      } as HttpRequest;

      const response = await controller.handleWebhook(request);

      expect(response.status).toBe(200);
      expect(mockUseCase.execute).toHaveBeenCalledWith(request.body);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook transaction enqueued',
        { messageId: 'msg-456' },
      );
    });

    test('should return 200 even when use case fails', async () => {
      const mockUseCase = createMockUseCase(new Error('Queue failed'));
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
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
      const mockUseCase = createMockUseCase(errorWithStack);
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
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

  describe('handleHealthCheck', () => {
    test('should return healthy status', () => {
      const mockUseCase = createMockUseCase();
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
        mockLogger,
      );

      const response = controller.handleHealthCheck();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  describe('routes', () => {
    test('should define correct routes', () => {
      const mockUseCase = createMockUseCase();
      const mockLogger = createMockLogger();

      const controller = new WebhookController(
        mockUseCase as unknown as ConstructorParameters<
          typeof WebhookController
        >[0],
        mockLogger,
      );

      expect(controller.prefix).toBe('/webhook');
      expect(controller.routes).toEqual([
        { method: 'get', path: '', handler: 'handleValidation' },
        { method: 'post', path: '', handler: 'handleWebhook' },
        { method: 'get', path: '/health', handler: 'handleHealthCheck' },
      ]);
    });
  });
});
