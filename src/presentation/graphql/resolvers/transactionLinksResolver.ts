import {
  TRANSACTION_LINK_REPOSITORY_TOKEN,
  type TransactionLinkRepository,
} from '@domain/repositories/TransactionLinkRepository.ts';
import { TransactionLinkService } from '@domain/services/TransactionLinkService.ts';
import { inject, injectable } from 'tsyringe';
import { mapTransactionLinkToGql } from '../mappers/transactionLink.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

@injectable()
export class TransactionLinksResolver extends Resolver {
  constructor(
    @inject(TRANSACTION_LINK_REPOSITORY_TOKEN)
    private transactionLinkRepository: TransactionLinkRepository,
    private transactionLinkService: TransactionLinkService,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        transactionLink: (_parent: unknown, args: { id: string }) =>
          this.getTransactionLinkById(args.id),
        transactionLinkByTransaction: (
          _parent: unknown,
          args: { transactionId: string },
        ) => this.getTransactionLinkByTransaction(args.transactionId),
      },
      Mutation: {
        createTransferLink: (
          _parent: unknown,
          args: {
            outgoingTransactionId: string;
            incomingTransactionId: string;
            notes?: string;
          },
        ) =>
          this.createTransferLink(
            args.outgoingTransactionId,
            args.incomingTransactionId,
            args.notes,
          ),
        deleteTransactionLink: (_parent: unknown, args: { id: string }) =>
          this.deleteTransactionLink(args.id),
      },
    };
  }

  private async getTransactionLinkById(id: string) {
    const link = await this.transactionLinkRepository.findByLinkId(id);
    return link ? mapTransactionLinkToGql(link) : null;
  }

  private async getTransactionLinkByTransaction(transactionId: string) {
    const links =
      await this.transactionLinkService.getLinkedTransactions(transactionId);
    const firstLink = links[0];
    if (!firstLink) {
      return null;
    }
    return mapTransactionLinkToGql(firstLink);
  }

  private async createTransferLink(
    outgoingTransactionId: string,
    incomingTransactionId: string,
    notes?: string,
  ) {
    const link = this.transactionLinkService.createTransfer(
      outgoingTransactionId,
      incomingTransactionId,
      notes,
    );
    const savedLink = await this.transactionLinkRepository.saveAndReturn(link);
    return mapTransactionLinkToGql(savedLink);
  }

  private async deleteTransactionLink(id: string) {
    const link = await this.transactionLinkRepository.findByLinkId(id);
    if (!link) {
      return false;
    }
    const dbId = link.dbId;
    if (dbId === null) {
      return false;
    }
    await this.transactionLinkRepository.delete(String(dbId));
    return true;
  }
}
