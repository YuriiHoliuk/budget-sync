import 'reflect-metadata';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { SyncMonobankResultDTO } from '@application/use-cases/SyncMonobank.ts';
import { SyncCommand } from '@presentation/cli/commands/SyncCommand.ts';
import { createMockLogger } from '../../../helpers';

interface MockSyncMonobankUseCase {
  execute: () => Promise<SyncMonobankResultDTO>;
}

function createMockUseCase(
  result: SyncMonobankResultDTO,
): MockSyncMonobankUseCase {
  return {
    execute: mock(() => Promise.resolve(result)),
  };
}

function createSuccessResult(): SyncMonobankResultDTO {
  return {
    accounts: { created: 1, updated: 2, unchanged: 3 },
    transactions: {
      totalAccounts: 2,
      syncedAccounts: 2,
      newTransactions: 10,
      updatedTransactions: 5,
      skippedTransactions: 15,
    },
    errors: [],
  };
}

describe('SyncCommand', () => {
  afterEach(() => {
    delete process.env['SYNC_FROM_DATE'];
  });

  describe('execute', () => {
    test('should call use case with delay option', async () => {
      const mockResult = createSuccessResult();
      const mockUseCase = createMockUseCase(mockResult);
      const mockLogger = createMockLogger();

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      await command.execute({ delay: 3000 });

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ requestDelayMs: 3000 }),
      );
    });

    test('should call use case with from date when provided', async () => {
      const mockResult = createSuccessResult();
      const mockUseCase = createMockUseCase(mockResult);
      const mockLogger = createMockLogger();

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      const fromDate = new Date('2025-01-15');
      await command.execute({ delay: 5000, from: fromDate });

      expect(mockUseCase.execute).toHaveBeenCalledWith({
        requestDelayMs: 5000,
        earliestSyncDate: fromDate,
        forceFromDate: true,
      });
    });

    test('should use SYNC_FROM_DATE env var when --from not provided', async () => {
      process.env['SYNC_FROM_DATE'] = '2025-02-01';

      const mockResult = createSuccessResult();
      const mockUseCase = createMockUseCase(mockResult);
      const mockLogger = createMockLogger();

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      await command.execute({ delay: 5000 });

      expect(mockUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          earliestSyncDate: new Date('2025-02-01'),
          forceFromDate: true,
        }),
      );
    });

    test('should call process.exit(1) when errors present', async () => {
      const resultWithErrors: SyncMonobankResultDTO = {
        ...createSuccessResult(),
        errors: ['API error'],
      };
      const mockUseCase = createMockUseCase(resultWithErrors);
      const mockLogger = createMockLogger();
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      try {
        await command.execute({ delay: 5000 });
      } catch {
        // Expected to throw due to mock
      }

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('meta', () => {
    test('should have correct command name and description', () => {
      const mockUseCase = createMockUseCase(createSuccessResult());
      const mockLogger = createMockLogger();

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      expect(command.meta.name).toBe('sync');
      expect(command.meta.description).toContain('Monobank');
    });

    test('should define delay option with default value', () => {
      const mockUseCase = createMockUseCase(createSuccessResult());
      const mockLogger = createMockLogger();

      const command = new SyncCommand(
        mockUseCase as unknown as ConstructorParameters<typeof SyncCommand>[0],
        mockLogger,
      );

      const delayOption = command.meta.options?.find((opt) =>
        opt.flags.includes('--delay'),
      );
      expect(delayOption).toBeDefined();
      expect(delayOption?.defaultValue).toBe(5000);
    });
  });
});
