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
import { CategorizationStatus } from '@domain/value-objects/CategorizationStatus.ts';
import {
  type DatabaseTransactionRepository,
  type TransactionFilterParams,
} from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
import { DATABASE_TRANSACTION_REPOSITORY_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
import type { TransactionRow } from '@modules/database/types.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

const STATUS_TO_GQL: Record<string, string> = {
  pending: 'PENDING',
  categorized: 'CATEGORIZED',
  verified: 'VERIFIED',
};

const TYPE_TO_GQL: Record<string, string> = {
  credit: 'CREDIT',
  debit: 'DEBIT',
};

interface TransactionGql {
  id: number;
  externalId: string;
  date: string;
  amount: number;
  currency: string;
  type: string;
  description: string;
  categorizationStatus: string;
  categoryReason: string | null;
  budgetReason: string | null;
  mcc: number | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  hold: boolean;
  cashbackAmount: number | null;
  commissionAmount: number | null;
  receiptId: string | null;
  notes: string | null;
  accountId: number | null;
  categoryId: number | null;
  budgetId: number | null;
}

function toMajorUnits(minorUnits: number): number {
  return minorUnits / 100;
}

function toMajorUnitsOrNull(minorUnits: number | null): number | null {
  return minorUnits != null ? toMajorUnits(minorUnits) : null;
}

function mapRowToGql(row: TransactionRow): TransactionGql {
  return {
    id: row.id,
    externalId: row.externalId ?? '',
    date: row.date.toISOString(),
    amount: toMajorUnits(Math.abs(row.amount)),
    currency: row.currency,
    type: TYPE_TO_GQL[row.type] ?? 'DEBIT',
    description: row.bankDescription ?? '',
    categorizationStatus:
      STATUS_TO_GQL[row.categorizationStatus ?? 'pending'] ?? 'PENDING',
    categoryReason: row.categoryReason,
    budgetReason: row.budgetReason,
    mcc: row.mcc,
    counterpartyName: row.counterparty,
    counterpartyIban: row.counterpartyIban,
    hold: row.hold ?? false,
    cashbackAmount: toMajorUnitsOrNull(row.cashback),
    commissionAmount: toMajorUnitsOrNull(row.commission),
    receiptId: row.receiptId,
    notes: row.notes,
    accountId: row.accountId,
    categoryId: row.categoryId,
    budgetId: row.budgetId,
  };
}

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

function resolveRepository(
  context: GraphQLContext,
): DatabaseTransactionRepository {
  return context.container.resolve<DatabaseTransactionRepository>(
    DATABASE_TRANSACTION_REPOSITORY_TOKEN,
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

      const [rows, totalCount] = await Promise.all([
        repository.findRowsFiltered(filter, pagination),
        repository.countFiltered(filter),
      ]);

      return {
        items: rows.map(mapRowToGql),
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
      const row = await repository.findRowByDbId(args.id);
      return row ? mapRowToGql(row) : null;
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

      const row = await repository.updateCategoryByDbId(
        args.input.id,
        categoryId,
      );
      if (!row) {
        throw new Error(`Transaction not found with id: ${args.input.id}`);
      }
      return mapRowToGql(row);
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

      const row = await repository.updateBudgetByDbId(args.input.id, budgetId);
      if (!row) {
        throw new Error(`Transaction not found with id: ${args.input.id}`);
      }
      return mapRowToGql(row);
    },

    verifyTransaction: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = resolveRepository(context);
      const row = await repository.updateStatusByDbId(
        args.id,
        CategorizationStatus.VERIFIED,
      );
      if (!row) {
        throw new Error(`Transaction not found with id: ${args.id}`);
      }
      return mapRowToGql(row);
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
      if (!account) {
        return null;
      }
      return {
        id: account.dbId,
        externalId: account.externalId,
        name: account.name,
        type: mapAccountType(account.type),
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
      if (!category) {
        return null;
      }
      return {
        id: category.dbId ?? 0,
        name: category.name,
        parentName: category.parent ?? null,
        status: mapCategoryStatus(category.status),
        fullPath: category.fullPath,
      };
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
      if (!budget) {
        return null;
      }
      return {
        id: budget.dbId,
        name: budget.name,
        type: budget.type.toUpperCase(),
        currency: budget.amount.currency.code,
        targetAmount: budget.amount.toMajorUnits(),
        targetCadence: budget.targetCadence
          ? budget.targetCadence.toUpperCase()
          : null,
        targetCadenceMonths: budget.targetCadenceMonths,
        targetDate: budget.targetDate
          ? budget.targetDate.toISOString().slice(0, 10)
          : null,
        startDate: budget.startDate
          ? budget.startDate.toISOString().slice(0, 10)
          : null,
        endDate: budget.endDate
          ? budget.endDate.toISOString().slice(0, 10)
          : null,
        isArchived: budget.isArchived,
      };
    },
  },
};

const MONOBANK_TYPE_TO_GQL: Record<string, string> = {
  black: 'DEBIT',
  white: 'DEBIT',
  platinum: 'DEBIT',
  yellow: 'DEBIT',
  eAid: 'DEBIT',
  iron: 'CREDIT',
  fop: 'FOP',
};

function mapAccountType(type: string | undefined): string {
  return MONOBANK_TYPE_TO_GQL[type ?? ''] ?? 'DEBIT';
}

const CATEGORY_STATUS_TO_GQL: Record<string, string> = {
  active: 'ACTIVE',
  suggested: 'SUGGESTED',
  archived: 'ARCHIVED',
};

function mapCategoryStatus(status: string): string {
  return CATEGORY_STATUS_TO_GQL[status] ?? 'ACTIVE';
}
