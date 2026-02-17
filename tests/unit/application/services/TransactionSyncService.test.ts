import 'reflect-metadata';
import { beforeEach, describe, expect, type mock, test } from 'bun:test';
import { TransactionSyncService } from '@application/services/TransactionSyncService.ts';
import type { Transaction } from '@domain/entities/Transaction.ts';
import type { BankTransactionRepository } from '@domain/repositories/BankTransactionRepository.ts';
import type { TransactionRepository } from '@domain/repositories/TransactionRepository.ts';
import { TransactionProcessingService } from '@domain/services/TransactionProcessingService.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { TransactionType } from '@domain/value-objects/TransactionType.ts';
import type { Logger } from '@modules/logging';
import {
  createMockBankTransactionRepository,
  createMockLogger,
  createMockTransactionRepository,
  createTestTransaction,
} from '../../helpers';

describe('TransactionSyncService', () => {
  let transactionRepository: TransactionRepository;
  let bankTransactionRepository: BankTransactionRepository;
  let transactionProcessingService: TransactionProcessingService;
  let logger: Logger;
  let service: TransactionSyncService;

  beforeEach(() => {
    transactionRepository = createMockTransactionRepository();
    bankTransactionRepository = createMockBankTransactionRepository();
    transactionProcessingService = new TransactionProcessingService();
    logger = createMockLogger();
    service = new TransactionSyncService(
      transactionRepository,
      bankTransactionRepository,
      transactionProcessingService,
      logger,
    );
  });

  describe('processBatch()', () => {
    test('should return zeros for empty transaction list', async () => {
      const result = await service.processBatch([], null);

      expect(result).toEqual({
        newCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        savedTransactions: [],
      });
      expect(transactionRepository.findByExternalIds).not.toHaveBeenCalled();
    });

    test('should save new transactions', async () => {
      const newTx = createTestTransaction({ externalId: 'new-tx-1' });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());

      const result = await service.processBatch([newTx], null);

      expect(result.newCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(transactionRepository.saveManyAndReturn).toHaveBeenCalledTimes(1);
    });

    test('should return saved transactions with dbIds', async () => {
      const newTx = createTestTransaction({ externalId: 'new-tx-1' });
      const savedTx = newTx.withDbId(42);

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());
      (
        transactionRepository.saveManyAndReturn as ReturnType<typeof mock>
      ).mockResolvedValue([savedTx]);

      const result = await service.processBatch([newTx], null);

      expect(result.savedTransactions).toHaveLength(1);
      expect(result.savedTransactions[0]?.dbId).toBe(42);
    });

    test('should skip existing transactions with no new fields', async () => {
      const existingTx = createTestTransaction({
        externalId: 'existing-tx',
        balance: Money.create(100000, Currency.UAH),
        mcc: 5411,
      });
      const incomingTx = createTestTransaction({
        externalId: 'existing-tx',
        balance: Money.create(100000, Currency.UAH),
        mcc: 5411,
      });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map([['existing-tx', existingTx]]));

      const result = await service.processBatch([incomingTx], null);

      expect(result.newCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(transactionRepository.saveManyAndReturn).not.toHaveBeenCalled();
    });

    test('should update existing transactions with missing bank fields', async () => {
      const existingTx = createTestTransaction({ externalId: 'tx-1' });
      const incomingTx = createTestTransaction({
        externalId: 'tx-1',
        balance: Money.create(100000, Currency.UAH),
      });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map([['tx-1', existingTx]]));

      const result = await service.processBatch([incomingTx], null);

      expect(result.updatedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(transactionRepository.updateMany).toHaveBeenCalledTimes(1);
    });

    test('should handle mix of new, updated, and skipped transactions', async () => {
      const newTx = createTestTransaction({ externalId: 'new-tx' });
      const existingToUpdate = createTestTransaction({
        externalId: 'update-tx',
      });
      const incomingToUpdate = createTestTransaction({
        externalId: 'update-tx',
        balance: Money.create(50000, Currency.UAH),
      });
      const existingComplete = createTestTransaction({
        externalId: 'complete-tx',
        balance: Money.create(100000, Currency.UAH),
        mcc: 5411,
      });
      const incomingComplete = createTestTransaction({
        externalId: 'complete-tx',
        balance: Money.create(100000, Currency.UAH),
        mcc: 5411,
      });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(
        new Map([
          ['update-tx', existingToUpdate],
          ['complete-tx', existingComplete],
        ]),
      );

      const result = await service.processBatch(
        [newTx, incomingToUpdate, incomingComplete],
        null,
      );

      expect(result.newCount).toBe(1);
      expect(result.updatedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });

    test('should sort new transactions by date ascending', async () => {
      const olderTx = createTestTransaction({
        externalId: 'old-tx',
        date: new Date('2026-01-01T10:00:00.000Z'),
      });
      const newerTx = createTestTransaction({
        externalId: 'new-tx',
        date: new Date('2026-01-03T10:00:00.000Z'),
      });
      const middleTx = createTestTransaction({
        externalId: 'mid-tx',
        date: new Date('2026-01-02T10:00:00.000Z'),
      });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());

      await service.processBatch([newerTx, olderTx, middleTx], null);

      const savedTransactions = (
        transactionRepository.saveManyAndReturn as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Transaction[];
      expect(savedTransactions[0]?.externalId).toBe('old-tx');
      expect(savedTransactions[1]?.externalId).toBe('mid-tx');
      expect(savedTransactions[2]?.externalId).toBe('new-tx');
    });

    test('should save bank transactions when accountDbId is provided', async () => {
      const newTx = createTestTransaction({ externalId: 'tx-1' });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());

      await service.processBatch([newTx], 42);

      expect(bankTransactionRepository.findByExternalIds).toHaveBeenCalledTimes(
        1,
      );
      expect(bankTransactionRepository.saveMany).toHaveBeenCalledTimes(1);
    });

    test('should not save bank transactions when accountDbId is null', async () => {
      const newTx = createTestTransaction({ externalId: 'tx-1' });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());

      await service.processBatch([newTx], null);

      expect(
        bankTransactionRepository.findByExternalIds,
      ).not.toHaveBeenCalled();
    });

    test('should deduplicate bank transactions', async () => {
      const newTx = createTestTransaction({ externalId: 'tx-1' });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());
      (
        bankTransactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map([['tx-1', {} as never]]));

      await service.processBatch([newTx], 42);

      expect(bankTransactionRepository.saveMany).not.toHaveBeenCalled();
    });

    test('should log error but not throw when bank transaction save fails', async () => {
      const newTx = createTestTransaction({ externalId: 'tx-1' });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());
      (
        bankTransactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Bank save failed'));

      const result = await service.processBatch([newTx], 42);

      expect(result.newCount).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save bank transactions'),
        expect.any(Object),
      );
    });

    test('should preserve existing comment when merging', async () => {
      const existingTx = createTestTransaction({
        externalId: 'tx-1',
        comment: 'User note',
      });
      const incomingTx = createTestTransaction({
        externalId: 'tx-1',
        balance: Money.create(100000, Currency.UAH),
        comment: 'Bank comment',
      });

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map([['tx-1', existingTx]]));

      await service.processBatch([incomingTx], null);

      const updatedTransactions = (
        transactionRepository.updateMany as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Transaction[];
      expect(updatedTransactions[0]?.comment).toBe('User note');
    });
  });

  describe('processSingle()', () => {
    test('should return saved transaction when not a duplicate', async () => {
      const transaction = createTestTransaction({ externalId: 'tx-new' });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockImplementation((txn: Transaction) =>
        Promise.resolve(txn.withDbId(99)),
      );

      const result = await service.processSingle(transaction, null);

      expect(result).not.toBeNull();
      expect(result?.externalId).toBe('tx-new');
      expect(result?.dbId).toBe(99);
      expect(transactionRepository.saveAndReturn).toHaveBeenCalledTimes(1);
    });

    test('should return null for duplicate transaction', async () => {
      const transaction = createTestTransaction({ externalId: 'tx-existing' });
      const existingTransaction = createTestTransaction({
        externalId: 'tx-existing',
      });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(existingTransaction);

      const result = await service.processSingle(transaction, null);

      expect(result).toBeNull();
      expect(transactionRepository.saveAndReturn).not.toHaveBeenCalled();
    });

    test('should save bank transaction when accountDbId is provided', async () => {
      const transaction = createTestTransaction({ externalId: 'tx-new' });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockImplementation((txn: Transaction) =>
        Promise.resolve(txn.withDbId(99)),
      );
      (
        bankTransactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      await service.processSingle(transaction, 42);

      expect(bankTransactionRepository.save).toHaveBeenCalledTimes(1);
    });

    test('should not save bank transaction when accountDbId is null', async () => {
      const transaction = createTestTransaction({ externalId: 'tx-new' });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockImplementation((txn: Transaction) =>
        Promise.resolve(txn.withDbId(99)),
      );

      await service.processSingle(transaction, null);

      expect(bankTransactionRepository.save).not.toHaveBeenCalled();
    });

    test('should log error when bank transaction save fails', async () => {
      const transaction = createTestTransaction({ externalId: 'tx-new' });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockImplementation((txn: Transaction) =>
        Promise.resolve(txn.withDbId(99)),
      );
      (
        bankTransactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        bankTransactionRepository.save as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Bank save failed'));

      const result = await service.processSingle(transaction, 42);

      // Should still return the saved transaction
      expect(result).not.toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save bank transaction'),
        expect.any(Object),
      );
    });
  });

  describe('classifyTransaction()', () => {
    test('should detect normal transaction', () => {
      const transaction = createTestTransaction({
        externalId: 'tx-normal',
        description: 'Grocery purchase',
        amount: Money.create(-5000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      const context = {
        accountId: 1,
      };

      const result = service.classifyTransaction(transaction, context);

      expect(result.isReturning).toBe(false);
      expect(result.hasFee).toBe(false);
      expect(result.transaction).not.toBeNull();
    });

    test('should detect cancellation/returning', () => {
      const transaction = createTestTransaction({
        externalId: 'tx-cancel',
        description:
          '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u043d\u043d\u044f. Grocery purchase',
        amount: Money.create(5000, Currency.UAH),
        type: TransactionType.CREDIT,
      });

      const context = {
        accountId: 1,
      };

      const result = service.classifyTransaction(transaction, context);

      expect(result.isReturning).toBe(true);
    });
  });

  describe('detectTransfers()', () => {
    test('should skip when only one own account', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      await service.detectTransfers([transaction], 1, [1]);

      expect(
        transactionRepository.findTransferCandidate,
      ).not.toHaveBeenCalled();
    });

    test('should skip transactions without dbId', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      await service.detectTransfers([transaction], 1, [1, 2]);

      expect(
        transactionRepository.findTransferCandidate,
      ).not.toHaveBeenCalled();
    });

    test('should search for transfer candidate with correct parameters', async () => {
      const date = new Date('2026-02-15T12:00:00Z');
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        date,
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      await service.detectTransfers([transaction], 1, [1, 2]);

      expect(transactionRepository.findTransferCandidate).toHaveBeenCalledWith({
        absoluteAmount: 50000,
        oppositeType: 'credit',
        excludeAccountId: 1,
        ownAccountIds: [1, 2],
        dateFrom: new Date(date.getTime() - 5 * 60 * 1000),
        dateTo: new Date(date.getTime() + 5 * 60 * 1000),
      });
    });

    test('should pair transactions when candidate found', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      (
        transactionRepository.findTransferCandidate as ReturnType<typeof mock>
      ).mockResolvedValue({ id: 20, accountId: 2 });

      await service.detectTransfers([transaction], 1, [1, 2]);

      // Both transactions marked as transfer
      expect(transactionRepository.updateRecordType).toHaveBeenCalledWith(
        10,
        'transfer',
      );
      expect(transactionRepository.updateRecordType).toHaveBeenCalledWith(
        20,
        'transfer',
      );

      // Transfer pair created (debit = outgoing)
      expect(transactionRepository.createTransferPair).toHaveBeenCalledWith(
        10,
        20,
      );
    });

    test('should set credit as incoming in transfer pair', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        amount: Money.create(50000, Currency.UAH),
        type: TransactionType.CREDIT,
      });

      (
        transactionRepository.findTransferCandidate as ReturnType<typeof mock>
      ).mockResolvedValue({ id: 20, accountId: 2 });

      await service.detectTransfers([transaction], 1, [1, 2]);

      // Credit transaction is incoming, candidate is outgoing
      expect(transactionRepository.createTransferPair).toHaveBeenCalledWith(
        20,
        10,
      );
    });

    test('should not pair when no candidate found', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      (
        transactionRepository.findTransferCandidate as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      await service.detectTransfers([transaction], 1, [1, 2]);

      expect(transactionRepository.updateRecordType).not.toHaveBeenCalled();
      expect(transactionRepository.createTransferPair).not.toHaveBeenCalled();
    });

    test('should log when transfer is detected', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-1',
        dbId: 10,
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
      });

      (
        transactionRepository.findTransferCandidate as ReturnType<typeof mock>
      ).mockResolvedValue({ id: 20, accountId: 2 });

      await service.detectTransfers([transaction], 1, [1, 2]);

      expect(logger.info).toHaveBeenCalledWith(
        'Transfer detected and paired',
        expect.objectContaining({
          outgoingId: 10,
          incomingId: 20,
          amount: 50000,
        }),
      );
    });
  });

  describe('isDuplicate()', () => {
    test('should return true when transaction exists', async () => {
      const existingTx = createTestTransaction({ externalId: 'tx-exists' });
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(existingTx);

      const result = await service.isDuplicate('tx-exists');

      expect(result).toBe(true);
    });

    test('should return false when transaction does not exist', async () => {
      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const result = await service.isDuplicate('tx-new');

      expect(result).toBe(false);
    });
  });

  describe('transaction_sources linking', () => {
    test('should link transaction_sources in processBatch when accountDbId provided', async () => {
      const newTx = createTestTransaction({
        externalId: 'tx-link-1',
        dbId: 10,
      });
      const savedTx = newTx.withDbId(10);

      (
        transactionRepository.findByExternalIds as ReturnType<typeof mock>
      ).mockResolvedValue(new Map());
      (
        transactionRepository.saveManyAndReturn as ReturnType<typeof mock>
      ).mockResolvedValue([savedTx]);

      const savedBankTx = {
        id: 100,
        externalId: 'tx-link-1',
      };
      (
        bankTransactionRepository.saveMany as ReturnType<typeof mock>
      ).mockResolvedValue([savedBankTx]);

      await service.processBatch([newTx], 42);

      expect(
        bankTransactionRepository.linkTransactionSources,
      ).toHaveBeenCalledWith([{ transactionId: 10, bankTransactionId: 100 }]);
    });

    test('should link transaction_sources in processSingle when accountDbId provided', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-link-single',
      });

      (
        transactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockImplementation((txn: Transaction) =>
        Promise.resolve(txn.withDbId(50)),
      );
      (
        bankTransactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(null);

      const savedBankTx = {
        id: 200,
        externalId: 'tx-link-single',
      };
      (
        bankTransactionRepository.save as ReturnType<typeof mock>
      ).mockResolvedValue(savedBankTx);

      await service.processSingle(transaction, 42);

      expect(
        bankTransactionRepository.linkTransactionSource,
      ).toHaveBeenCalledWith(50, 200);
    });
  });

  describe('detectReturnings()', () => {
    test('should skip non-cancellation transactions', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-normal',
        description: 'Grocery purchase',
        amount: Money.create(-5000, Currency.UAH),
        type: TransactionType.DEBIT,
        dbId: 10,
      });

      const result = await service.detectReturnings([transaction], 1);

      expect(result.size).toBe(0);
      expect(
        transactionRepository.findCancellationCandidate,
      ).not.toHaveBeenCalled();
    });

    test('should find and handle partial refund', async () => {
      const cancellation = createTestTransaction({
        externalId: 'tx-cancel-1',
        description:
          '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u043d\u043d\u044f. Grocery purchase',
        amount: Money.create(1500, Currency.UAH),
        type: TransactionType.CREDIT,
        dbId: 20,
      });

      (
        transactionRepository.findCancellationCandidate as ReturnType<
          typeof mock
        >
      ).mockResolvedValue({
        id: 10,
        amount: -5000,
        categoryId: 3,
        budgetId: 5,
        categorizationStatus: 'categorized',
        categoryReason: 'test reason',
        budgetReason: 'budget reason',
      });

      const result = await service.detectReturnings([cancellation], 1);

      expect(result.size).toBe(0);
      expect(
        transactionRepository.updateTransactionAmount,
      ).toHaveBeenCalledWith(10, -3500); // -5000 + 1500 = -3500
      expect(transactionRepository.updateRecordType).toHaveBeenCalledWith(
        20,
        'returning',
      );
      expect(
        transactionRepository.setAdjustedTransactionId,
      ).toHaveBeenCalledWith(20, 10);
      expect(transactionRepository.updateRecordCategory).toHaveBeenCalledWith(
        20,
        3,
      );
      expect(transactionRepository.updateRecordBudget).toHaveBeenCalledWith(
        20,
        5,
      );
    });

    test('should handle full refund by deleting both transactions', async () => {
      const cancellation = createTestTransaction({
        externalId: 'tx-cancel-full',
        description:
          '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u043d\u043d\u044f. Big purchase',
        amount: Money.create(5000, Currency.UAH),
        type: TransactionType.CREDIT,
        dbId: 30,
      });

      (
        transactionRepository.findCancellationCandidate as ReturnType<
          typeof mock
        >
      ).mockResolvedValue({
        id: 25,
        amount: -5000,
        categoryId: null,
        budgetId: null,
        categorizationStatus: null,
        categoryReason: null,
        budgetReason: null,
      });
      (
        transactionRepository.findByDbId as ReturnType<typeof mock>
      ).mockResolvedValue(
        createTestTransaction({ externalId: 'tx-original-25', dbId: 25 }),
      );

      const result = await service.detectReturnings([cancellation], 1);

      expect(result.size).toBe(1);
      expect(result.has(30)).toBe(true);
      expect(transactionRepository.delete).toHaveBeenCalledWith(
        'tx-cancel-full',
      );
      expect(transactionRepository.delete).toHaveBeenCalledWith(
        'tx-original-25',
      );
    });

    test('should warn when no match found', async () => {
      const cancellation = createTestTransaction({
        externalId: 'tx-no-match',
        description:
          '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u043d\u043d\u044f. Unknown purchase',
        amount: Money.create(5000, Currency.UAH),
        type: TransactionType.CREDIT,
        dbId: 40,
      });

      (
        transactionRepository.findCancellationCandidate as ReturnType<
          typeof mock
        >
      ).mockResolvedValue(null);

      const result = await service.detectReturnings([cancellation], 1);

      expect(result.size).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Returning transaction has no matching original',
        expect.objectContaining({
          transactionId: 40,
        }),
      );
    });

    test('should prefer exact amount match via findCancellationCandidate', async () => {
      const cancellation = createTestTransaction({
        externalId: 'tx-exact',
        description:
          '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u043d\u043d\u044f. Exact purchase',
        amount: Money.create(3000, Currency.UAH),
        type: TransactionType.CREDIT,
        dbId: 50,
      });

      (
        transactionRepository.findCancellationCandidate as ReturnType<
          typeof mock
        >
      ).mockResolvedValue({
        id: 45,
        amount: -3000,
        categoryId: null,
        budgetId: null,
        categorizationStatus: null,
        categoryReason: null,
        budgetReason: null,
      });

      await service.detectReturnings([cancellation], 1);

      expect(
        transactionRepository.findCancellationCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 1,
          bankDescription: 'Exact purchase',
          refundAmount: 3000,
        }),
      );
    });
  });

  describe('detectFeeSplits()', () => {
    test('should skip transactions without commission', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-no-fee',
        description: 'Regular purchase',
        amount: Money.create(-5000, Currency.UAH),
        type: TransactionType.DEBIT,
        dbId: 10,
      });

      await service.detectFeeSplits([transaction], 1);

      expect(
        transactionRepository.updateTransactionAmount,
      ).not.toHaveBeenCalled();
      expect(transactionRepository.saveAndReturn).not.toHaveBeenCalled();
    });

    test('should reduce amount and create fee transaction', async () => {
      const transaction = createTestTransaction({
        externalId: 'tx-with-fee',
        description: 'International purchase',
        amount: Money.create(-50000, Currency.UAH),
        type: TransactionType.DEBIT,
        dbId: 60,
        commissionRate: Money.create(2500, Currency.UAH),
      });

      const savedFee = createTestTransaction({
        externalId: 'tx-with-fee-fee',
        dbId: 61,
      });
      (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mockResolvedValue(savedFee);

      const bankTx = { id: 300, externalId: 'tx-with-fee' };
      (
        bankTransactionRepository.findByExternalId as ReturnType<typeof mock>
      ).mockResolvedValue(bankTx);

      await service.detectFeeSplits([transaction], 1);

      // Main transaction reduced: -50000 + 2500 = -47500
      expect(
        transactionRepository.updateTransactionAmount,
      ).toHaveBeenCalledWith(60, -47500);

      // Fee transaction created
      expect(transactionRepository.saveAndReturn).toHaveBeenCalledTimes(1);
      const savedCall = (
        transactionRepository.saveAndReturn as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Transaction;
      expect(savedCall.amount.amount).toBe(-2500);
      expect(savedCall.description).toBe('Bank commission');

      // Fee transaction linked to same bank transaction
      expect(
        bankTransactionRepository.linkTransactionSource,
      ).toHaveBeenCalledWith(61, 300);
    });
  });
});
