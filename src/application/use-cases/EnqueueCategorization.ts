/**
 * Use case for enqueuing a transaction for async categorization via Pub/Sub.
 *
 * Publishes a minimal message (transaction DB ID) to the categorization queue.
 * The actual categorization is performed by the push subscription handler
 * (POST /webhook/categorize) which calls CategorizeTransactionUseCase.
 */

import type { QueuedCategorizationDTO } from '@application/dtos/QueuedCategorizationDTO.ts';
import {
  CATEGORIZATION_QUEUE_GATEWAY_TOKEN,
  type CategorizationQueueGateway,
} from '@domain/gateways/CategorizationQueueGateway.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface EnqueueCategorizationRequestDTO {
  transactionDbId: number;
}

export interface EnqueueCategorizationResultDTO {
  messageId: string;
}

@injectable()
export class EnqueueCategorizationUseCase extends UseCase<
  EnqueueCategorizationRequestDTO,
  EnqueueCategorizationResultDTO
> {
  constructor(
    @inject(CATEGORIZATION_QUEUE_GATEWAY_TOKEN)
    private categorizationQueue: CategorizationQueueGateway,
  ) {
    super();
  }

  async execute(
    request: EnqueueCategorizationRequestDTO,
  ): Promise<EnqueueCategorizationResultDTO> {
    const queueMessage: QueuedCategorizationDTO = {
      transactionDbId: request.transactionDbId,
    };

    const messageId = await this.categorizationQueue.publish(queueMessage);
    return { messageId };
  }
}
