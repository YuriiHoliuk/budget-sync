import type { Account } from '@domain/entities/Account.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

const MONOBANK_TYPE_TO_GQL: Record<string, string> = {
  black: 'DEBIT',
  white: 'DEBIT',
  platinum: 'DEBIT',
  yellow: 'DEBIT',
  eAid: 'DEBIT',
  iron: 'CREDIT',
  fop: 'FOP',
};

function mapAccountToGql(account: Account) {
  return {
    id: account.dbId,
    externalId: account.externalId,
    name: account.name,
    type: MONOBANK_TYPE_TO_GQL[account.type ?? ''] ?? 'DEBIT',
    role: account.role.toUpperCase(),
    currency: account.currency.code,
    balance: account.balance.toMajorUnits(),
    creditLimit: account.creditLimit
      ? account.creditLimit.toMajorUnits()
      : null,
    iban: account.iban ?? null,
    bank: account.bank ?? null,
    lastSyncTime: account.lastSyncTime
      ? new Date(account.lastSyncTime).toISOString()
      : null,
    isCreditAccount: account.isCreditAccount,
  };
}

export const accountsResolver = {
  Query: {
    accounts: async (
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<AccountRepository>(
        ACCOUNT_REPOSITORY_TOKEN,
      );
      const accounts = await repository.findAll();
      return accounts.map(mapAccountToGql);
    },

    account: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<AccountRepository>(
        ACCOUNT_REPOSITORY_TOKEN,
      );
      const allAccounts = await repository.findAll();
      const account = allAccounts.find((account) => account.dbId === args.id);
      return account ? mapAccountToGql(account) : null;
    },
  },
};
