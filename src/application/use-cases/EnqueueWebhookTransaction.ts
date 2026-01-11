import type { QueuedWebhookTransactionDTO } from '@application/dtos/QueuedWebhookTransactionDTO.ts';
import type { WebhookTransactionData } from '@domain/dtos/WebhookTransactionData.ts';
import {
  BANK_GATEWAY_TOKEN,
  type BankGateway,
} from '@domain/gateways/BankGateway.ts';
import {
  MESSAGE_QUEUE_GATEWAY_TOKEN,
  type MessageQueueGateway,
} from '@domain/gateways/MessageQueueGateway.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

/**
 * Result DTO for the EnqueueWebhookTransaction use case.
 */
export interface EnqueueWebhookTransactionResultDTO {
  /** The message ID assigned by the queue */
  messageId: string;
}

/**
 * Use case for handling incoming webhook transactions.
 *
 * This use case:
 * 1. Validates and parses the webhook payload using the bank gateway
 * 2. Serializes the transaction data to a queue-friendly format
 * 3. Enqueues the data for async processing
 * 4. Returns immediately to meet Monobank's 5-second response requirement
 *
 * The actual transaction processing is handled by ProcessIncomingTransactionUseCase
 * in a separate queue processor job.
 */
@injectable()
export class EnqueueWebhookTransactionUseCase extends UseCase<
  unknown,
  EnqueueWebhookTransactionResultDTO
> {
  constructor(
    @inject(BANK_GATEWAY_TOKEN)
    private bankGateway: BankGateway,
    @inject(MESSAGE_QUEUE_GATEWAY_TOKEN)
    private messageQueueGateway: MessageQueueGateway,
  ) {
    super();
  }

  /**
   * Execute the use case.
   *
   * @param payload - Raw webhook payload from the bank (will be validated)
   * @returns The message ID assigned by the queue
   * @throws Error if payload validation fails
   */
  async execute(payload: unknown): Promise<EnqueueWebhookTransactionResultDTO> {
    const webhookData = this.bankGateway.parseWebhookPayload(payload);
    const queueMessage = this.serializeForQueue(webhookData);
    const messageId = await this.messageQueueGateway.publish(queueMessage);

    return { messageId };
  }

  /**
   * Serialize webhook transaction data to a queue-friendly format.
   * Converts domain objects (Money, Date) to primitive types for JSON serialization.
   */
  private serializeForQueue(
    data: WebhookTransactionData,
  ): QueuedWebhookTransactionDTO {
    const { transaction, accountExternalId, newBalance } = data;

    return {
      accountExternalId,
      newBalanceAmount: newBalance.amount,
      newBalanceCurrencyCode: newBalance.currency.numericCode,
      transaction: {
        externalId: transaction.externalId,
        date: transaction.date.toISOString(),
        amount: transaction.amount.amount,
        currencyCode: transaction.amount.currency.numericCode,
        operationAmount:
          transaction.operationAmount?.amount ?? transaction.amount.amount,
        operationCurrencyCode:
          transaction.operationAmount?.currency.numericCode ??
          transaction.amount.currency.numericCode,
        description: transaction.description,
        type: transaction.isCredit ? 'CREDIT' : 'DEBIT',
        mcc: transaction.mcc ?? 0,
        hold: transaction.isHold,
        balanceAmount: transaction.balance?.amount ?? 0,
        comment: transaction.comment,
        counterpartyName: transaction.counterpartyName,
        counterpartyIban: transaction.counterpartyIban,
        cashbackAmount: transaction.cashbackAmount?.amount,
        commissionRate: transaction.commissionRate?.amount,
        originalMcc: transaction.originalMcc,
        receiptId: transaction.receiptId,
        invoiceId: transaction.invoiceId,
        counterEdrpou: transaction.counterEdrpou,
      },
    };
  }
}
