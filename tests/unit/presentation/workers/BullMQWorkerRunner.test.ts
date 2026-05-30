import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import type { CategorizeTransactionResultDTO } from '@application/use-cases/CategorizeTransaction.ts';
import type { ProcessIncomingTransactionResultDTO } from '@application/use-cases/ProcessIncomingTransaction.ts';
import type { RedisQueueConfig } from '@infrastructure/gateways/redis/types.ts';
import { LLMRateLimitError } from '@modules/llm/index.ts';
import { NoopMetrics } from '@modules/metrics/index.ts';
import { BullMQWorkerRunner } from '@presentation/workers/BullMQWorkerRunner.ts';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { createMockLogger } from '../../helpers/mocks.ts';

const config: RedisQueueConfig = {
  webhookQueueName: 'webhook-transactions',
  categorizationQueueName: 'categorization-queue',
  maxAttempts: 5,
  backoffMs: 2000,
  workerConcurrency: 4,
};

const validWebhookData: QueuedWebhookTransactionDTO = {
  accountExternalId: 'acc-1',
  newBalanceAmount: 1000,
  newBalanceCurrencyCode: 980,
  transaction: {
    externalId: 'tx-1',
    date: '2024-01-01T00:00:00.000Z',
    amount: -500,
    currencyCode: 980,
    operationAmount: -500,
    operationCurrencyCode: 980,
    description: 'Coffee',
    type: 'DEBIT',
    mcc: 5814,
    hold: false,
    balanceAmount: 1000,
  },
};

function createRunner(overrides: {
  process?: (
    input: QueuedWebhookTransactionDTO,
  ) => Promise<ProcessIncomingTransactionResultDTO>;
  categorize?: (request: {
    transactionDbId: number;
  }) => Promise<CategorizeTransactionResultDTO>;
}) {
  const processIncoming = {
    execute:
      overrides.process ??
      mock(() =>
        Promise.resolve<ProcessIncomingTransactionResultDTO>({
          saved: true,
          transactionExternalId: 'tx-1',
        }),
      ),
  };
  const categorize = {
    execute:
      overrides.categorize ??
      mock(() =>
        Promise.resolve<CategorizeTransactionResultDTO>({
          success: true,
          category: 'Food',
          budget: 'Groceries',
          isNewCategory: false,
        }),
      ),
  };
  const metrics = new NoopMetrics();
  const recordTransactionProcessed = mock(metrics.recordTransactionProcessed);
  const recordCategorization = mock(metrics.recordCategorization);
  metrics.recordTransactionProcessed = recordTransactionProcessed;
  metrics.recordCategorization = recordCategorization;

  const runner = new BullMQWorkerRunner(
    {} as never,
    {} as never,
    processIncoming as never,
    categorize as never,
    {} as never,
    config,
    metrics,
    createMockLogger(),
  );

  return {
    runner,
    processIncoming,
    categorize,
    recordTransactionProcessed,
    recordCategorization,
  };
}

function makeJob(data: unknown): Job {
  return { data } as Job;
}

describe('BullMQWorkerRunner handlers', () => {
  test('webhook handler throws UnrecoverableError on invalid data', async () => {
    const { runner } = createRunner({});
    const handler = (
      runner as unknown as { handleWebhookJob: (job: Job) => Promise<void> }
    ).handleWebhookJob;

    await expect(handler(makeJob({ bogus: true }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  test('webhook handler executes the use case on valid data', async () => {
    const { runner, processIncoming, recordTransactionProcessed } =
      createRunner({});
    const handler = (
      runner as unknown as { handleWebhookJob: (job: Job) => Promise<void> }
    ).handleWebhookJob;

    await handler(makeJob(validWebhookData));

    expect(processIncoming.execute).toHaveBeenCalledTimes(1);
    expect(recordTransactionProcessed).toHaveBeenCalledTimes(1);
  });

  test('categorization handler throws UnrecoverableError on invalid data', async () => {
    const { runner } = createRunner({});
    const handler = (
      runner as unknown as {
        handleCategorizationJob: (job: Job) => Promise<void>;
      }
    ).handleCategorizationJob;

    await expect(handler(makeJob({}))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  test('categorization handler records "ok" on success', async () => {
    const { runner, categorize, recordCategorization } = createRunner({});
    const handler = (
      runner as unknown as {
        handleCategorizationJob: (job: Job) => Promise<void>;
      }
    ).handleCategorizationJob;

    await handler(makeJob({ transactionDbId: 7 }));

    expect(categorize.execute).toHaveBeenCalledWith({ transactionDbId: 7 });
    expect(recordCategorization).toHaveBeenCalledWith('ok', expect.any(Number));
  });

  test('categorization handler records "rate_limited" and rethrows on LLMRateLimitError', async () => {
    const error = new LLMRateLimitError();
    const { runner, recordCategorization } = createRunner({
      categorize: mock(() => Promise.reject(error)),
    });
    const handler = (
      runner as unknown as {
        handleCategorizationJob: (job: Job) => Promise<void>;
      }
    ).handleCategorizationJob;

    await expect(handler(makeJob({ transactionDbId: 7 }))).rejects.toBe(error);
    expect(recordCategorization).toHaveBeenCalledWith(
      'rate_limited',
      expect.any(Number),
    );
  });

  test('categorization handler records "error" and rethrows on other errors', async () => {
    const error = new Error('boom');
    const { runner, recordCategorization } = createRunner({
      categorize: mock(() => Promise.reject(error)),
    });
    const handler = (
      runner as unknown as {
        handleCategorizationJob: (job: Job) => Promise<void>;
      }
    ).handleCategorizationJob;

    await expect(handler(makeJob({ transactionDbId: 7 }))).rejects.toBe(error);
    expect(recordCategorization).toHaveBeenCalledWith(
      'error',
      expect.any(Number),
    );
  });
});
