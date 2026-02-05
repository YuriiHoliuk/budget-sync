import {
  ACCOUNT_REPOSITORY_TOKEN,
  AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';
import { mapAccountToGql } from '../mappers/index.ts';

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
