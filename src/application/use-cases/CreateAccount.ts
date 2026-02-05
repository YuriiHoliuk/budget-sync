import {
  Account,
  type AccountRole,
  type AccountType,
} from '@domain/entities/Account.ts';
import { AccountNameTakenError } from '@domain/errors/DomainErrors.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateAccountRequestDTO {
  name: string;
  type: AccountType;
  role: AccountRole;
  currency: string;
  balance: number;
  iban?: string | null;
  creditLimit?: number | null;
}

@injectable()
export class CreateAccountUseCase extends UseCase<
  CreateAccountRequestDTO,
  Account
> {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private readonly accountRepository: AccountRepository,
  ) {
    super();
  }

  async execute(request: CreateAccountRequestDTO): Promise<Account> {
    await this.ensureNameIsAvailable(request.name);
    const account = this.buildAccount(request);
    return this.accountRepository.saveAndReturn(account);
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.accountRepository.findByName(name);
    if (existing) {
      throw new AccountNameTakenError(name);
    }
  }

  private buildAccount(request: CreateAccountRequestDTO): Account {
    const currency = Currency.fromCode(request.currency);
    const balance = Money.create(request.balance, currency);
    const creditLimit =
      request.creditLimit != null && request.creditLimit > 0
        ? Money.create(request.creditLimit, currency)
        : undefined;

    return Account.create({
      externalId: this.generateExternalId(),
      name: request.name,
      currency,
      balance,
      creditLimit,
      type: request.type,
      role: request.role,
      iban: request.iban ?? undefined,
      source: 'manual',
      isArchived: false,
    });
  }

  private generateExternalId(): string {
    return `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
