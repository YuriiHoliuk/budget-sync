import { ArchiveAccountUseCase } from '@application/use-cases/ArchiveAccount.ts';
import type { CreateAccountRequestDTO } from '@application/use-cases/CreateAccount.ts';
import { CreateAccountUseCase } from '@application/use-cases/CreateAccount.ts';
import type { UpdateAccountRequestDTO } from '@application/use-cases/UpdateAccount.ts';
import { UpdateAccountUseCase } from '@application/use-cases/UpdateAccount.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { inject, injectable } from 'tsyringe';
import {
  GQL_TO_ACCOUNT_ROLE,
  GQL_TO_ACCOUNT_TYPE,
  mapAccountToGql,
  toMinorUnits,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateAccountInput {
  name: string;
  type: string;
  role: string;
  currency: string;
  balance: number;
  iban?: string | null;
  creditLimit?: number | null;
}

interface UpdateAccountInput {
  id: number;
  name?: string | null;
  type?: string | null;
  role?: string | null;
  currency?: string | null;
  balance?: number | null;
  iban?: string | null;
  creditLimit?: number | null;
}

@injectable()
export class AccountsResolver extends Resolver {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    private createAccountUseCase: CreateAccountUseCase,
    private updateAccountUseCase: UpdateAccountUseCase,
    private archiveAccountUseCase: ArchiveAccountUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        accounts: (_parent: unknown, args: { activeOnly?: boolean }) =>
          this.getAccounts(args.activeOnly ?? true),
        account: (_parent: unknown, args: { id: number }) =>
          this.getAccountById(args.id),
      },
      Mutation: {
        createAccount: (
          _parent: unknown,
          args: { input: CreateAccountInput },
        ) => this.createAccount(args.input),
        updateAccount: (
          _parent: unknown,
          args: { input: UpdateAccountInput },
        ) => this.updateAccount(args.input),
        archiveAccount: (_parent: unknown, args: { id: number }) =>
          this.archiveAccount(args.id),
      },
    };
  }

  private async getAccounts(activeOnly: boolean) {
    const accounts = activeOnly
      ? await this.accountRepository.findActive()
      : await this.accountRepository.findAll();
    return accounts.map(mapAccountToGql);
  }

  private async getAccountById(id: number) {
    const account = await this.accountRepository.findByDbId(id);
    return account ? mapAccountToGql(account) : null;
  }

  private async createAccount(input: CreateAccountInput) {
    const account = await this.createAccountUseCase.execute(
      this.mapCreateInput(input),
    );
    return mapAccountToGql(account);
  }

  private async updateAccount(input: UpdateAccountInput) {
    const account = await this.updateAccountUseCase.execute(
      this.mapUpdateInput(input),
    );
    return mapAccountToGql(account);
  }

  private async archiveAccount(id: number) {
    const account = await this.archiveAccountUseCase.execute({ id });
    return mapAccountToGql(account);
  }

  private mapCreateInput(input: CreateAccountInput): CreateAccountRequestDTO {
    return {
      name: input.name,
      type: GQL_TO_ACCOUNT_TYPE[input.type] ?? 'debit',
      role: GQL_TO_ACCOUNT_ROLE[input.role] ?? 'operational',
      currency: input.currency,
      balance: toMinorUnits(input.balance),
      iban: input.iban ?? null,
      creditLimit:
        input.creditLimit != null ? toMinorUnits(input.creditLimit) : null,
    };
  }

  private mapUpdateInput(input: UpdateAccountInput): UpdateAccountRequestDTO {
    return {
      id: input.id,
      name: input.name ?? undefined,
      type: this.mapOptionalType(input.type),
      role: this.mapOptionalRole(input.role),
      currency: input.currency ?? undefined,
      balance: this.mapOptionalBalance(input.balance),
      iban: input.iban !== undefined ? input.iban : undefined,
      creditLimit: this.mapOptionalCreditLimit(input.creditLimit),
    };
  }

  private mapOptionalType(type: string | null | undefined) {
    return type ? (GQL_TO_ACCOUNT_TYPE[type] ?? undefined) : undefined;
  }

  private mapOptionalRole(role: string | null | undefined) {
    return role ? (GQL_TO_ACCOUNT_ROLE[role] ?? undefined) : undefined;
  }

  private mapOptionalBalance(balance: number | null | undefined) {
    return balance != null ? toMinorUnits(balance) : undefined;
  }

  private mapOptionalCreditLimit(creditLimit: number | null | undefined) {
    if (creditLimit === undefined) {
      return undefined;
    }
    return creditLimit != null ? toMinorUnits(creditLimit) : null;
  }
}
