import { inject, injectable } from 'tsyringe';
import {
  TransactionLink,
  type TransactionLinkMember,
} from '../entities/TransactionLink.ts';
import {
  TRANSACTION_LINK_REPOSITORY_TOKEN,
  TransactionLinkRepository,
} from '../repositories/TransactionLinkRepository.ts';

/**
 * Domain service for managing transaction links.
 *
 * Provides high-level operations for creating and querying transaction links
 * such as transfers between accounts and split transactions.
 */
@injectable()
export class TransactionLinkService {
  constructor(
    @inject(TRANSACTION_LINK_REPOSITORY_TOKEN)
    private readonly repository: TransactionLinkRepository,
  ) {}

  /**
   * Creates a transfer link between two transactions.
   *
   * @param outgoingTxId - The ID of the outgoing (debit) transaction
   * @param incomingTxId - The ID of the incoming (credit) transaction
   * @param notes - Optional notes describing the transfer
   * @returns The created TransactionLink entity
   */
  createTransfer(
    outgoingTxId: string,
    incomingTxId: string,
    notes?: string,
  ): TransactionLink {
    const members: TransactionLinkMember[] = [
      { transactionId: outgoingTxId, role: 'outgoing' },
      { transactionId: incomingTxId, role: 'incoming' },
    ];

    return TransactionLink.create({
      linkType: 'transfer',
      members,
      notes,
    });
  }

  /**
   * Creates a split link between a source transaction and its parts.
   *
   * @param sourceTxId - The ID of the source transaction being split
   * @param partTxIds - The IDs of the part transactions
   * @returns The created TransactionLink entity
   */
  createSplit(sourceTxId: string, partTxIds: string[]): TransactionLink {
    const members: TransactionLinkMember[] = [
      { transactionId: sourceTxId, role: 'source' },
      ...partTxIds.map((txId) => ({
        transactionId: txId,
        role: 'part' as const,
      })),
    ];

    return TransactionLink.create({
      linkType: 'split',
      members,
    });
  }

  /**
   * Retrieves all transaction links that include a specific transaction.
   *
   * @param transactionId - The ID of the transaction to search for
   * @returns Array of TransactionLink entities containing the transaction
   */
  getLinkedTransactions(transactionId: string): Promise<TransactionLink[]> {
    return this.repository.findByTransactionId(transactionId);
  }

  /**
   * Checks if a transaction is part of any link.
   *
   * @param transactionId - The ID of the transaction to check
   * @returns True if the transaction is linked, false otherwise
   */
  async isLinked(transactionId: string): Promise<boolean> {
    const links = await this.repository.findByTransactionId(transactionId);
    return links.length > 0;
  }
}
