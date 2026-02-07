import type { LinkType, TransactionLink } from '../entities/TransactionLink.ts';
import { Repository } from './Repository.ts';

/**
 * Injection token for TransactionLinkRepository.
 * Use with @inject(TRANSACTION_LINK_REPOSITORY_TOKEN) in classes that depend on TransactionLinkRepository.
 */
export const TRANSACTION_LINK_REPOSITORY_TOKEN = Symbol(
  'TransactionLinkRepository',
);

/**
 * Repository for managing transaction links.
 * Extends the generic Repository with TransactionLink-specific operations.
 */
export abstract class TransactionLinkRepository extends Repository<
  TransactionLink,
  string
> {
  /**
   * Find a link by its database ID.
   */
  abstract findByLinkId(linkId: string): Promise<TransactionLink | null>;

  /**
   * Find all links that include a specific transaction.
   */
  abstract findByTransactionId(
    transactionId: string,
  ): Promise<TransactionLink[]>;

  /**
   * Find all links of a specific type.
   */
  abstract findAllByType(linkType: LinkType): Promise<TransactionLink[]>;
}
