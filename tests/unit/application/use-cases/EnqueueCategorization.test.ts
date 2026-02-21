import 'reflect-metadata';
import { beforeEach, describe, expect, type mock, test } from 'bun:test';
import { EnqueueCategorizationUseCase } from '@application/use-cases/EnqueueCategorization.ts';
import type { CategorizationQueueGateway } from '@domain/gateways/CategorizationQueueGateway.ts';
import { createMockCategorizationQueueGateway } from '../../helpers';

describe('EnqueueCategorizationUseCase', () => {
  let categorizationQueue: CategorizationQueueGateway;
  let useCase: EnqueueCategorizationUseCase;

  beforeEach(() => {
    categorizationQueue = createMockCategorizationQueueGateway();
    useCase = new EnqueueCategorizationUseCase(categorizationQueue);
  });

  describe('execute()', () => {
    test('should publish transactionDbId to categorization queue', async () => {
      const result = await useCase.execute({ transactionDbId: 42 });

      expect(result.messageId).toBe('cat-msg-123');
      expect(categorizationQueue.publish).toHaveBeenCalledWith({
        transactionDbId: 42,
      });
    });

    test('should return message ID from queue', async () => {
      (
        categorizationQueue.publish as ReturnType<typeof mock>
      ).mockResolvedValue('custom-msg-id');

      const result = await useCase.execute({ transactionDbId: 99 });

      expect(result.messageId).toBe('custom-msg-id');
    });

    test('should propagate queue errors', async () => {
      (
        categorizationQueue.publish as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Queue unavailable'));

      await expect(useCase.execute({ transactionDbId: 1 })).rejects.toThrow(
        'Queue unavailable',
      );
    });
  });
});
