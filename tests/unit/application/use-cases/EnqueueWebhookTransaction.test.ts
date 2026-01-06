import 'reflect-metadata';
import { beforeEach, describe, expect, type mock, test } from 'bun:test';
import { EnqueueWebhookTransactionUseCase } from '@application/use-cases/EnqueueWebhookTransaction.ts';
import type { WebhookTransactionData } from '@domain/dtos/WebhookTransactionData.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type { MessageQueueGateway } from '@domain/gateways/MessageQueueGateway.ts';
import {
  Currency,
  Money,
  TransactionType,
} from '@domain/value-objects/index.ts';
import {
  createMockBankGateway,
  createMockMessageQueueGateway,
  createTestWebhookPayload,
} from '../../helpers';

describe('EnqueueWebhookTransactionUseCase', () => {
  let bankGateway: BankGateway;
  let messageQueueGateway: MessageQueueGateway;
  let useCase: EnqueueWebhookTransactionUseCase;

  function createMockWebhookData(
    overrides: Partial<{
      accountExternalId: string;
      transactionExternalId: string;
      amount: number;
      balance: number;
    }> = {},
  ): WebhookTransactionData {
    const currency = Currency.UAH;
    return {
      accountExternalId: overrides.accountExternalId ?? 'acc-123',
      transaction: Transaction.create({
        externalId: overrides.transactionExternalId ?? 'tx-123',
        date: new Date('2026-01-01T12:00:00.000Z'),
        amount: Money.create(overrides.amount ?? -5000, currency),
        description: 'Test Transaction',
        type: TransactionType.DEBIT,
        accountId: overrides.accountExternalId ?? 'acc-123',
        mcc: 5411,
        hold: false,
        balance: Money.create(overrides.balance ?? 100000, currency),
      }),
      newBalance: Money.create(overrides.balance ?? 100000, currency),
    };
  }

  beforeEach(() => {
    bankGateway = createMockBankGateway();
    messageQueueGateway = createMockMessageQueueGateway();
    useCase = new EnqueueWebhookTransactionUseCase(
      bankGateway,
      messageQueueGateway,
    );
  });

  describe('execute()', () => {
    test('should parse payload with gateway and enqueue', async () => {
      const payload = createTestWebhookPayload();
      const webhookData = createMockWebhookData();

      (
        bankGateway.parseWebhookPayload as ReturnType<typeof mock>
      ).mockReturnValue(webhookData);
      (
        messageQueueGateway.publish as ReturnType<typeof mock>
      ).mockResolvedValue('msg-456');

      const result = await useCase.execute(payload);

      expect(result.messageId).toBe('msg-456');
      expect(bankGateway.parseWebhookPayload).toHaveBeenCalledWith(payload);
      expect(messageQueueGateway.publish).toHaveBeenCalledTimes(1);
    });

    test('should serialize transaction data correctly for queue', async () => {
      const payload = createTestWebhookPayload();
      const webhookData = createMockWebhookData({
        accountExternalId: 'test-acc',
        transactionExternalId: 'tx-789',
        amount: -10000,
        balance: 50000,
      });

      (
        bankGateway.parseWebhookPayload as ReturnType<typeof mock>
      ).mockReturnValue(webhookData);

      await useCase.execute(payload);

      const publishCall = (
        messageQueueGateway.publish as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Record<string, unknown>;

      expect(publishCall['accountExternalId']).toBe('test-acc');
      expect(publishCall['newBalanceAmount']).toBe(50000);
      expect(publishCall['newBalanceCurrencyCode']).toBe(980); // UAH

      const txData = publishCall['transaction'] as Record<string, unknown>;
      expect(txData['externalId']).toBe('tx-789');
      expect(txData['amount']).toBe(-10000);
      expect(txData['type']).toBe('DEBIT');
    });

    test('should throw when gateway validation fails', async () => {
      const invalidPayload = { invalid: true };

      (
        bankGateway.parseWebhookPayload as ReturnType<typeof mock>
      ).mockImplementation(() => {
        throw new Error('Invalid payload');
      });

      await expect(useCase.execute(invalidPayload)).rejects.toThrow(
        'Invalid payload',
      );
      expect(messageQueueGateway.publish).not.toHaveBeenCalled();
    });

    test('should propagate queue gateway errors', async () => {
      const payload = createTestWebhookPayload();
      const webhookData = createMockWebhookData();

      (
        bankGateway.parseWebhookPayload as ReturnType<typeof mock>
      ).mockReturnValue(webhookData);
      (
        messageQueueGateway.publish as ReturnType<typeof mock>
      ).mockRejectedValue(new Error('Pub/Sub connection failed'));

      await expect(useCase.execute(payload)).rejects.toThrow(
        'Pub/Sub connection failed',
      );
    });

    test('should handle credit transactions', async () => {
      const payload = createTestWebhookPayload();
      const currency = Currency.UAH;
      const creditTransaction = Transaction.create({
        externalId: 'tx-credit',
        date: new Date('2026-01-01T12:00:00.000Z'),
        amount: Money.create(10000, currency), // Positive = credit
        description: 'Income',
        type: TransactionType.CREDIT,
        accountId: 'acc-123',
        balance: Money.create(110000, currency),
      });

      const webhookData: WebhookTransactionData = {
        accountExternalId: 'acc-123',
        transaction: creditTransaction,
        newBalance: Money.create(110000, currency),
      };

      (
        bankGateway.parseWebhookPayload as ReturnType<typeof mock>
      ).mockReturnValue(webhookData);

      await useCase.execute(payload);

      const publishCall = (
        messageQueueGateway.publish as ReturnType<typeof mock>
      ).mock.calls[0]?.[0] as Record<string, unknown>;
      const txData = publishCall['transaction'] as Record<string, unknown>;
      expect(txData['type']).toBe('CREDIT');
      expect(txData['amount']).toBe(10000);
    });
  });
});
