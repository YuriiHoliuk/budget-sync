/**
 * DTO for categorization requests queued via Pub/Sub.
 *
 * Minimal payload — only the transaction database ID is needed
 * since CategorizeTransactionUseCase loads everything else.
 */

import { z } from 'zod';

export const queuedCategorizationSchema = z.object({
  transactionDbId: z.number().int().positive(),
});

export type QueuedCategorizationDTO = z.infer<
  typeof queuedCategorizationSchema
>;
