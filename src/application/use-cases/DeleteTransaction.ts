import {
  AccountNotFoundError,
  ManualTransactionNotAllowedError,
  TransactionNotFoundError,
} from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface DeleteTransactionRequestDTO {
  /** Transaction database ID */
  id: number;
}

@injectable()
export class DeleteTransactionUseCase extends UseCase<
  DeleteTransactionRequestDTO,
  boolean
> {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private readonly transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: DeleteTransactionRequestDTO): Promise<boolean> {
    const record = await this.transactionRepository.findRecordById(request.id);
    if (!record) {
      throw new TransactionNotFoundError(request.id);
    }

    if (record.accountId === null) {
      throw new AccountNotFoundError(String(request.id), 'id');
    }

    const account = await this.accountRepository.findByDbId(record.accountId);
    if (!account) {
      throw new AccountNotFoundError(String(record.accountId), 'id');
    }

    if (account.isSynced) {
      throw new ManualTransactionNotAllowedError(record.accountId);
    }

    await this.transactionRepository.deleteByDbId(request.id);
    return true;
  }
}
