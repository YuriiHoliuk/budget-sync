import type { Account } from '@domain/entities/Account.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface ArchiveAccountRequestDTO {
  id: number;
}

@injectable()
export class ArchiveAccountUseCase extends UseCase<
  ArchiveAccountRequestDTO,
  Account
> {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: ArchiveAccountRequestDTO): Promise<Account> {
    const account = await this.accountRepository.findByDbId(request.id);
    if (!account) {
      throw new AccountNotFoundError(String(request.id), 'id');
    }

    const archived = account.archive();
    await this.accountRepository.update(archived);

    const result = await this.accountRepository.findByDbId(request.id);
    if (!result) {
      throw new AccountNotFoundError(String(request.id), 'id');
    }
    return result;
  }
}
