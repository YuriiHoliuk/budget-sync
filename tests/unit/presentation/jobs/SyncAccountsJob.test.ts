import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { RegisterWebhookResult } from '@application/use-cases/RegisterWebhook.ts';
import type { SyncAccountsResultDTO } from '@application/use-cases/SyncAccounts.ts';
import { SyncAccountsJob } from '@presentation/jobs/SyncAccountsJob.ts';
import { createMockLogger } from '../../helpers/mocks.ts';

interface MockSyncAccountsUseCase {
  execute: () => Promise<SyncAccountsResultDTO>;
}

interface MockRegisterWebhookUseCase {
  execute: (request: { webhookUrl: string }) => Promise<RegisterWebhookResult>;
}

function createMockSyncUseCase(
  result: SyncAccountsResultDTO,
): MockSyncAccountsUseCase {
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

function createMockRegisterWebhookUseCase(
  result: RegisterWebhookResult = { success: true },
): MockRegisterWebhookUseCase {
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

function createJob(
  syncResult: SyncAccountsResultDTO,
  webhookResult?: RegisterWebhookResult,
) {
  const mockLogger = createMockLogger();
  const mockSyncUseCase = createMockSyncUseCase(syncResult);
  const mockWebhookUseCase = createMockRegisterWebhookUseCase(webhookResult);

  const job = new SyncAccountsJob(
    mockLogger,
    mockSyncUseCase as unknown as ConstructorParameters<
      typeof SyncAccountsJob
    >[1],
    mockWebhookUseCase as unknown as ConstructorParameters<
      typeof SyncAccountsJob
    >[2],
  );

  return { job, mockLogger, mockSyncUseCase, mockWebhookUseCase };
}

describe('SyncAccountsJob', () => {
  describe('execute', () => {
    test('should call sync use case and return result', async () => {
      const expectedResult: SyncAccountsResultDTO = {
        created: 2,
        updated: 1,
        unchanged: 3,
        errors: [],
      };
      const { job, mockSyncUseCase } = createJob(expectedResult);

      const result = await job.execute();

      expect(result.created).toBe(2);
      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(3);
      expect(result.errors).toEqual([]);
      expect(mockSyncUseCase.execute).toHaveBeenCalledTimes(1);
    });

    test('should log errors when present', async () => {
      const resultWithErrors: SyncAccountsResultDTO = {
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: ['Error 1', 'Error 2'],
      };
      const { job, mockLogger } = createJob(resultWithErrors);

      await job.execute();

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });

    test('should skip webhook registration when URL not set', async () => {
      const syncResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: [],
      };
      const { job, mockWebhookUseCase, mockLogger } = createJob(syncResult);

      const result = await job.execute();

      expect(result.webhookRegistration).toBeUndefined();
      expect(mockWebhookUseCase.execute).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'WEBHOOK_URL not set, skipping webhook registration',
      );
    });

    test('should register webhook when URL is set', async () => {
      const syncResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: [],
      };
      const { job, mockWebhookUseCase, mockLogger } = createJob(syncResult);
      job.setWebhookUrl('https://example.com/webhook');

      const result = await job.execute();

      expect(result.webhookRegistration).toEqual({ success: true });
      expect(mockWebhookUseCase.execute).toHaveBeenCalledWith({
        webhookUrl: 'https://example.com/webhook',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook registered successfully',
        { url: 'https://example.com/webhook' },
      );
    });

    test('should not fail job when webhook registration fails', async () => {
      const syncResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: [],
      };
      const webhookResult: RegisterWebhookResult = {
        success: false,
        error: 'Monobank API unavailable',
      };
      const { job, mockLogger } = createJob(syncResult, webhookResult);
      job.setWebhookUrl('https://example.com/webhook');

      const result = await job.execute();

      expect(result.webhookRegistration).toEqual(webhookResult);
      expect(result.errors).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook registration failed (non-fatal)',
        { error: 'Monobank API unavailable' },
      );
    });
  });

  describe('toJobResult', () => {
    test('should return success when no errors', async () => {
      const syncResult: SyncAccountsResultDTO = {
        created: 2,
        updated: 1,
        unchanged: 3,
        errors: [],
      };
      const { job } = createJob(syncResult);

      const result = await job.execute();
      const jobResult = job['toJobResult'](result);

      expect(jobResult.success).toBe(true);
      expect(jobResult.exitCode).toBe(0);
      expect(jobResult.summary).toEqual({
        accountsCreated: 2,
        accountsUpdated: 1,
        accountsUnchanged: 3,
        errorCount: 0,
        webhookRegistered: 'skipped',
      });
    });

    test('should return failure when errors present', async () => {
      const failureResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: ['Failed to sync account'],
      };
      const { job } = createJob(failureResult);

      const result = await job.execute();
      const jobResult = job['toJobResult'](result);

      expect(jobResult.success).toBe(false);
      expect(jobResult.exitCode).toBe(1);
      expect(jobResult.summary?.['errorCount']).toBe(1);
    });

    test('should include webhook status in summary', async () => {
      const syncResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: [],
      };
      const { job } = createJob(syncResult);
      job.setWebhookUrl('https://example.com/webhook');

      const result = await job.execute();
      const jobResult = job['toJobResult'](result);

      expect(jobResult.summary?.['webhookRegistered']).toBe(true);
    });
  });
});
