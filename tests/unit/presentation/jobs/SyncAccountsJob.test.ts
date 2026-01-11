import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import type { SyncAccountsResultDTO } from '@application/use-cases/SyncAccounts.ts';
import { SyncAccountsJob } from '@presentation/jobs/SyncAccountsJob.ts';
import { createMockLogger } from '../../helpers';

interface MockSyncAccountsUseCase {
  execute: () => Promise<SyncAccountsResultDTO>;
}

function createMockUseCase(
  result: SyncAccountsResultDTO,
): MockSyncAccountsUseCase {
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

describe('SyncAccountsJob', () => {
  describe('execute', () => {
    test('should call use case and return result', async () => {
      const expectedResult: SyncAccountsResultDTO = {
        created: 2,
        updated: 1,
        unchanged: 3,
        errors: [],
      };
      const mockUseCase = createMockUseCase(expectedResult);
      const mockLogger = createMockLogger();

      const job = new SyncAccountsJob(
        mockLogger,
        mockUseCase as unknown as ConstructorParameters<
          typeof SyncAccountsJob
        >[1],
      );

      const result = await job.execute();

      expect(result).toEqual(expectedResult);
      expect(mockUseCase.execute).toHaveBeenCalledTimes(1);
    });

    test('should log errors when present', async () => {
      const resultWithErrors: SyncAccountsResultDTO = {
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: ['Error 1', 'Error 2'],
      };
      const mockUseCase = createMockUseCase(resultWithErrors);
      const mockLogger = createMockLogger();

      const job = new SyncAccountsJob(
        mockLogger,
        mockUseCase as unknown as ConstructorParameters<
          typeof SyncAccountsJob
        >[1],
      );

      await job.execute();

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('toJobResult', () => {
    test('should return success when no errors', async () => {
      const successResult: SyncAccountsResultDTO = {
        created: 2,
        updated: 1,
        unchanged: 3,
        errors: [],
      };
      const mockUseCase = createMockUseCase(successResult);
      const mockLogger = createMockLogger();

      const job = new SyncAccountsJob(
        mockLogger,
        mockUseCase as unknown as ConstructorParameters<
          typeof SyncAccountsJob
        >[1],
      );

      const result = await job.execute();
      const jobResult = job['toJobResult'](result);

      expect(jobResult.success).toBe(true);
      expect(jobResult.exitCode).toBe(0);
      expect(jobResult.summary).toEqual({
        accountsCreated: 2,
        accountsUpdated: 1,
        accountsUnchanged: 3,
        errorCount: 0,
      });
    });

    test('should return failure when errors present', async () => {
      const failureResult: SyncAccountsResultDTO = {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: ['Failed to sync account'],
      };
      const mockUseCase = createMockUseCase(failureResult);
      const mockLogger = createMockLogger();

      const job = new SyncAccountsJob(
        mockLogger,
        mockUseCase as unknown as ConstructorParameters<
          typeof SyncAccountsJob
        >[1],
      );

      const result = await job.execute();
      const jobResult = job['toJobResult'](result);

      expect(jobResult.success).toBe(false);
      expect(jobResult.exitCode).toBe(1);
      expect(jobResult.summary?.['errorCount']).toBe(1);
    });
  });
});
