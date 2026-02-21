import {
  AccountNotFoundError,
  TransactionNotFoundError,
  TransferRevertNotAllowedError,
} from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { TransactionRecord } from '@domain/repositories/transaction-types.ts';
import { Money } from '@domain/value-objects/Money.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

const COUNTERPART_PREFIX = 'transfer-counterpart-';

export interface RevertTransferRequestDTO {
  transactionId: number;
}

@injectable()
export class RevertTransferUseCase extends UseCase<
  RevertTransferRequestDTO,
  void
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: RevertTransferRequestDTO): Promise<void> {
    const pair =
      await this.transactionRepository.findTransferPairByTransactionId(
        request.transactionId,
      );
    if (!pair) {
      throw new TransactionNotFoundError(request.transactionId);
    }

    const isOutgoing = pair.outgoingTransactionId === request.transactionId;
    const counterpartId = isOutgoing
      ? pair.incomingTransactionId
      : pair.outgoingTransactionId;

    const counterpartRecord =
      await this.transactionRepository.findRecordById(counterpartId);
    if (!counterpartRecord) {
      throw new TransactionNotFoundError(counterpartId);
    }

    this.validateIsManuallyCreated(counterpartRecord);

    await this.transactionRepository.deleteTransferPair(
      pair.outgoingTransactionId,
      pair.incomingTransactionId,
    );

    const revertedType = isOutgoing ? 'debit' : 'credit';
    await this.transactionRepository.updateRecordType(
      request.transactionId,
      revertedType,
    );

    await this.revertDestinationBalance(counterpartRecord, revertedType);

    await this.transactionRepository.delete(counterpartRecord.externalId ?? '');
  }

  private validateIsManuallyCreated(counterpart: TransactionRecord): void {
    if (
      !counterpart.externalId ||
      !counterpart.externalId.startsWith(COUNTERPART_PREFIX)
    ) {
      throw new TransferRevertNotAllowedError(counterpart.id);
    }
  }

  private async revertDestinationBalance(
    counterpartRecord: TransactionRecord,
    sourceRevertedType: string,
  ): Promise<void> {
    if (!counterpartRecord.accountId) {
      return;
    }

    const account = await this.accountRepository.findByDbId(
      counterpartRecord.accountId,
    );
    if (!account) {
      throw new AccountNotFoundError(
        counterpartRecord.accountId.toString(),
        'id',
      );
    }

    const absoluteAmount = Math.abs(counterpartRecord.amount);
    const transferAmount = Money.create(absoluteAmount, account.currency);

    // Reverse what ConvertToTransfer did:
    // If source was debit → we added to destination, so now subtract
    // If source was credit → we subtracted from destination, so now add
    const newBalance =
      sourceRevertedType === 'debit'
        ? account.balance.subtract(transferAmount)
        : account.balance.add(transferAmount);

    await this.accountRepository.updateBalance(account.externalId, newBalance);
  }
}
