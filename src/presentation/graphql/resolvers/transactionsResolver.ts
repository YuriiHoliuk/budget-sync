import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  CATEGORY_REPOSITORY_TOKEN,
  type CategoryRepository,
} from '@domain/repositories/CategoryRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import type { TransactionFilterParams } from '@domain/repositories/transaction-types.ts';
import { CategorizationStatus } from '@domain/value-objects/CategorizationStatus.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';
import {
  mapAccountToGql,
  mapBudgetToGql,
  mapCategoryToGql,
  mapTransactionRecordToGql,
  type TransactionGql,
} from '../mappers/index.ts';

interface TransactionFilter {
  accountId?: number;
  categoryId?: number;
  budgetId?: number;
  type?: string;
  categorizationStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface PaginationInput {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function resolveRepository(context: GraphQLContext): TransactionRepository {
  return context.container.resolve<TransactionRepository>(
    TRANSACTION_REPOSITORY_TOKEN,
  );
}

function mapFilter(filter?: TransactionFilter): TransactionFilterParams {
  if (!filter) {
    return {};
  }
  return {
    accountId: filter.accountId ?? undefined,
    categoryId: filter.categoryId ?? undefined,
    budgetId: filter.budgetId ?? undefined,
    type: filter.type ?? undefined,
    categorizationStatus: filter.categorizationStatus ?? undefined,
    dateFrom: filter.dateFrom ?? undefined,
    dateTo: filter.dateTo ?? undefined,
    search: filter.search ?? undefined,
  };
}

function resolvePagination(pagination?: PaginationInput) {
  const limit = Math.min(pagination?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = pagination?.offset ?? 0;
  return { limit, offset };
}

export const transactionsResolver = {
  Query: {
    transactions: async (
      _parent: unknown,
      args: { filter?: TransactionFilter; pagination?: PaginationInput },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const filter = mapFilter(args.filter);
      const pagination = resolvePagination(args.pagination);

      const [records, totalCount] = await Promise.all([
        repository.findRecordsFiltered(filter, pagination),
        repository.countFiltered(filter),
      ]);

      return {
        items: records.map(mapTransactionRecordToGql),
        totalCount,
        hasMore: pagination.offset + pagination.limit < totalCount,
      };
    },

    transaction: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const record = await repository.findRecordById(args.id);
      return record ? mapTransactionRecordToGql(record) : null;
    },
  },

  Mutation: {
    updateTransactionCategory: async (
      _parent: unknown,
      args: { input: { id: number; categoryId?: number | null } },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const categoryId = args.input.categoryId ?? null;

      if (categoryId !== null) {
        const categoryRepo = context.container.resolve<CategoryRepository>(
          CATEGORY_REPOSITORY_TOKEN,
        );
        const category = await categoryRepo.findById(categoryId);
        if (!category) {
          throw new Error(`Category not found with id: ${categoryId}`);
        }
      }

      const record = await repository.updateRecordCategory(
        args.input.id,
        categoryId,
      );
      if (!record) {
        throw new Error(`Transaction not found with id: ${args.input.id}`);
      }
      return mapTransactionRecordToGql(record);
    },

    updateTransactionBudget: async (
      _parent: unknown,
      args: { input: { id: number; budgetId?: number | null } },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const budgetId = args.input.budgetId ?? null;

      if (budgetId !== null) {
        const budgetRepo = context.container.resolve<BudgetRepository>(
          BUDGET_REPOSITORY_TOKEN,
        );
        const budget = await budgetRepo.findById(budgetId);
        if (!budget) {
          throw new Error(`Budget not found with id: ${budgetId}`);
        }
      }

      const record = await repository.updateRecordBudget(
        args.input.id,
        budgetId,
      );
      if (!record) {
        throw new Error(`Transaction not found with id: ${args.input.id}`);
      }
      return mapTransactionRecordToGql(record);
    },

    verifyTransaction: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const record = await repository.updateRecordStatus(
        args.id,
        CategorizationStatus.VERIFIED,
      );
      if (!record) {
        throw new Error(`Transaction not found with id: ${args.id}`);
      }
      return mapTransactionRecordToGql(record);
    },
  },

  Transaction: {
    account: async (
      parent: TransactionGql,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      if (parent.accountId === null) {
        return null;
      }
      const repository = context.container.resolve<AccountRepository>(
        ACCOUNT_REPOSITORY_TOKEN,
      );
      const allAccounts = await repository.findAll();
      const account = allAccounts.find(
        (account) => account.dbId === parent.accountId,
      );
      return account ? mapAccountToGql(account) : null;
    },

    category: async (
      parent: TransactionGql,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      if (parent.categoryId === null) {
        return null;
      }
      const repository = context.container.resolve<CategoryRepository>(
        CATEGORY_REPOSITORY_TOKEN,
      );
      const category = await repository.findById(parent.categoryId);
      return category ? mapCategoryToGql(category) : null;
    },

    budget: async (
      parent: TransactionGql,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      if (parent.budgetId === null) {
        return null;
      }
      const repository = context.container.resolve<BudgetRepository>(
        BUDGET_REPOSITORY_TOKEN,
      );
      const budget = await repository.findById(parent.budgetId);
      return budget ? mapBudgetToGql(budget) : null;
    },
  },
};
