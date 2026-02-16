import 'reflect-metadata';
import { beforeEach, describe, expect, type mock, test } from 'bun:test';
import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import type { CategorizeTransactionUseCase } from '@application/use-cases/CategorizeTransaction.ts';
import { ProcessIncomingTransactionUseCase } from '@application/use-cases/ProcessIncomingTransaction.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { CategorizationStatus } from '@domain/value-objects/index.ts';
import { LLMRateLimitError } from '@modules/llm/index.ts';
import type { Logger } from '@modules/logging';
import {
  createMockAccountRepository,
  createMockBankTransactionRepository,
  createMockCategorizeTransactionUseCase,
  createMockLogger,
  createMockTransactionRepository,
  createTestAccount,
  createTestQueuedTransaction,
  createTestTransaction,
} from '../../helpers';

describe('ProcessIncomingTransactionUseCase', () => {
  let accountRepository: AccountRepository;
  let transactionRepository: TransactionRepository;
  let bankTransactionRepository: BankTransactionRepository;
  let categorizeTransaction: CategorizeTransactionUseCase;
  let logger: Logger;
  let useCase: ProcessIncomingTransactionUseCase;

  beforeEach(() => {
    accountRepository = createMockAccountRepository();
    transactionRepository = createMockTransactionRepository();
    bankTransactionRepository = createMockBankTransactionRepository();
    categorizeTransaction = createMockCategorizeTransactionUseCase();
    logger = createMockLogger();
    useCase = new ProcessIncomingTransactionUseCase(
      accountRepository,
      transactionRepository,
      bankTransactionRepository,
      categorizeTransaction,
      logger,
    );
  });

  describe('execute()', () => {
    test('should save new transaction and update balance', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        transaction: { externalId: 'tx-new' },
        newBalanceAmount: 95000,
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const result = await useCase.execute(input);

      expect(result.saved).toBe(true);
      expect(result.transactionExternalId).toBe('tx-new');
      expect(transactionRepository.save).toHaveBeenCalledTimes(1);
      expect(accountRepository.updateBalance).toHaveBeenCalledTimes(1);
    });

    test('should skip duplicate transaction', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const existingTransaction = createTestTransaction({
        externalId: 'tx-existing',
      });
      const input = createTestQueuedTransaction({
        transaction: { externalId: 'tx-existing' },
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(existingTransaction);

      const result = await useCase.execute(input);

      expect(result.saved).toBe(false);
      expect(result.transactionExternalId).toBe('tx-existing');
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(accountRepository.updateBalance).not.toHaveBeenCalled();
    });

    test('should throw AccountNotFoundError when account not found', async () => {
      const input = createTestQueuedTransaction({
        accountExternalId: 'non-existent-acc',
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      await expect(useCase.execute(input)).rejects.toThrow(
        AccountNotFoundError,
      );
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(accountRepository.updateBalance).not.toHaveBeenCalled();
    });

    test('should pass correct balance to updateBalance', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        newBalanceAmount: 150000,
        newBalanceCurrencyCode: 980,
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      await useCase.execute(input);

      const updateBalanceCall = (
        accountRepository.updateBalance as ReturnType<typeof mock>
      ).mock.calls[0] as [string, { amount: number }];
      expect(updateBalanceCall[0]).toBe('acc-123');
      expect(updateBalanceCall[1].amount).toBe(150000);
    });

    test('should reconstruct transaction from queued data', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        transaction: {
          externalId: 'tx-reconstructed',
          description: 'Grocery Store',
          amount: -2500,
        },
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      await useCase.execute(input);

      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalId: 'tx-reconstructed',
          description: 'Grocery Store',
        }),
      );
    });

    test('should propagate repository errors', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction();

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (transactionRepository.save as ReturnType<typeof mock>).mockRejectedValue(
        new Error('Database write failed'),
      );

      await expect(useCase.execute(input)).rejects.toThrow(
        'Database write failed',
      );
    });

    test('should handle credit transactions', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input: QueuedWebhookTransactionDTO = createTestQueuedTransaction({
        transaction: {
          externalId: 'tx-credit',
          amount: 10000,
          type: 'CREDIT',
        },
        newBalanceAmount: 110000,
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const result = await useCase.execute(input);

      expect(result.saved).toBe(true);
      expect(transactionRepository.save).toHaveBeenCalledTimes(1);
    });

    test('should mark categorization as failed when LLM error occurs', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        transaction: { externalId: 'tx-fail' },
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        categorizeTransaction.execute as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('LLM unavailable'));

      const result = await useCase.execute(input);

      expect(result.saved).toBe(true);
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        'tx-fail',
        {
          category: null,
          budget: null,
          categoryReason: null,
          budgetReason: null,
          status: CategorizationStatus.FAILED,
        },
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to categorize transaction',
        expect.objectContaining({ externalId: 'tx-fail' }),
      );
    });

    test('should retry once on rate limit before failing', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        transaction: { externalId: 'tx-rate-limited' },
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      // First call: rate limit, second call: success
      let callCount = 0;
      (
        categorizeTransaction.execute as ReturnType<typeof mock>
      ).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new LLMRateLimitError());
        }
        return Promise.resolve({
          success: true,
          category: 'Food',
          budget: null,
          isNewCategory: false,
        });
      });

      // Override sleep to avoid waiting 60s in tests
      (useCase as any).sleep = () => Promise.resolve();

      const result = await useCase.execute(input);

      expect(result.saved).toBe(true);
      expect(categorizeTransaction.execute).toHaveBeenCalledTimes(2);
      expect(transactionRepository.updateCategorization).not.toHaveBeenCalled();
    });

    test('should mark as failed when retry also hits rate limit', async () => {
      const account = createTestAccount({ externalId: 'acc-123' });
      const input = createTestQueuedTransaction({
        transaction: { externalId: 'tx-double-rate-limit' },
      });

      (
        accountRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(account);
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        categorizeTransaction.execute as ReturnType<typeof mock>
      ).mockRejectedValue(new LLMRateLimitError());

      // Override sleep to avoid waiting 60s in tests
      (useCase as any).sleep = () => Promise.resolve();

      const result = await useCase.execute(input);

      expect(result.saved).toBe(true);
      expect(categorizeTransaction.execute).toHaveBeenCalledTimes(2);
      expect(transactionRepository.updateCategorization).toHaveBeenCalledWith(
        'tx-double-rate-limit',
        {
          category: null,
          budget: null,
          categoryReason: null,
          budgetReason: null,
          status: CategorizationStatus.FAILED,
        },
      );
    });
  });
});
