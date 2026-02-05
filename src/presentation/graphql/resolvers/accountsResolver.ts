import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import { inject, injectable } from 'tsyringe';
import { mapAccountToGql } from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

@injectable()
export class AccountsResolver extends Resolver {
  constructor(
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        accounts: () => this.getAccounts(),
        account: (_parent: unknown, args: { id: number }) =>
          this.getAccountById(args.id),
      },
    };
  }

  private async getAccounts() {
    const accounts = await this.accountRepository.findAll();
    return accounts.map(mapAccountToGql);
  }

  private async getAccountById(id: number) {
    const allAccounts = await this.accountRepository.findAll();
    const account = allAccounts.find((account) => account.dbId === id);
    return account ? mapAccountToGql(account) : null;
  }
}
