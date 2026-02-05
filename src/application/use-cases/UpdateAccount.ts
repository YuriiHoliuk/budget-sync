import type {
  Account,
  AccountRole,
  AccountType,
} from '@domain/entities/Account.ts';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  ProtectedFieldUpdateError,
} from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface UpdateAccountRequestDTO {
  id: number;
  name?: string;
  type?: AccountType;
  role?: AccountRole;
  currency?: string;
  balance?: number;
  iban?: string | null;
  creditLimit?: number | null;
}

@injectable()
export class UpdateAccountUseCase extends UseCase<
  UpdateAccountRequestDTO,
  Account
> {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: UpdateAccountRequestDTO): Promise<Account> {
    const existing = await this.findAccount(request.id);
    this.validateProtectedFields(existing, request);
    await this.ensureNameIsAvailable(request.name, request.id);

    const updated = this.applyUpdates(existing, request);
    await this.accountRepository.update(updated);

    const result = await this.accountRepository.findByDbId(request.id);
    if (!result) {
      throw new AccountNotFoundError(String(request.id), 'id');
    }
    return result;
  }

  private async findAccount(accountId: number): Promise<Account> {
    const account = await this.accountRepository.findByDbId(accountId);
    if (!account) {
      throw new AccountNotFoundError(String(accountId), 'id');
    }
    return account;
  }

  private validateProtectedFields(
    account: Account,
    request: UpdateAccountRequestDTO,
  ): void {
    if (!account.isSynced) {
      return;
    }

    const accountId = account.dbId;
    if (accountId === null) {
      return;
    }

    if (request.iban !== undefined && request.iban !== account.iban) {
      throw new ProtectedFieldUpdateError('iban', accountId);
    }

    if (
      request.currency !== undefined &&
      request.currency !== account.currency.code
    ) {
      throw new ProtectedFieldUpdateError('currency', accountId);
    }
  }

  private async ensureNameIsAvailable(
    name: string | undefined,
    currentId: number,
  ): Promise<void> {
    if (!name) {
      return;
    }
    const existing = await this.accountRepository.findByName(name);
    if (existing && existing.dbId !== currentId) {
      throw new AccountNameTakenError(name);
    }
  }

  private applyUpdates(
    account: Account,
    request: UpdateAccountRequestDTO,
  ): Account {
    const currency = request.currency
      ? Currency.fromCode(request.currency)
      : account.currency;

    const balance =
      request.balance !== undefined
        ? Money.create(request.balance, currency)
        : account.balance;

    const creditLimit = this.resolveCreditLimit(account, request, currency);

    return account.withUpdatedProps({
      name: request.name ?? account.name,
      type: request.type ?? account.type,
      role: request.role ?? account.role,
      currency,
      balance,
      creditLimit,
      iban:
        request.iban !== undefined ? (request.iban ?? undefined) : account.iban,
    });
  }

  private resolveCreditLimit(
    account: Account,
    request: UpdateAccountRequestDTO,
    currency: Currency,
  ): Money | undefined {
    if (request.creditLimit === undefined) {
      return account.creditLimit;
    }
    if (request.creditLimit === null || request.creditLimit <= 0) {
      return undefined;
    }
    return Money.create(request.creditLimit, currency);
  }
}
