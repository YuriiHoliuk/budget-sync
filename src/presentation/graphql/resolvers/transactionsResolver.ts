import {
  type CreateTransactionRequestDTO,
  CreateTransactionUseCase,
} from '@application/use-cases/CreateTransaction.ts';
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
import { inject, injectable } from 'tsyringe';
import {
  mapAccountToGql,
  mapBudgetToGql,
  mapCategoryToGql,
  mapTransactionRecordToGql,
  type TransactionGql,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface TransactionFilter {
  accountId?: number;
  categoryId?: number;
  budgetId?: number;
  unbudgetedOnly?: boolean;
  accountRole?: 'OPERATIONAL' | 'SAVINGS';
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

interface UpdateCategoryInput {
  id: number;
  categoryId?: number | null;
}

interface UpdateBudgetInput {
  id: number;
  budgetId?: number | null;
}

interface CreateTransactionInput {
  accountId: number;
  date: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  description: string;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  mcc?: number | null;
  notes?: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@injectable()
export class TransactionsResolver extends Resolver {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    @inject(ACCOUNT_REPOSITORY_TOKEN)
    private accountRepository: AccountRepository,
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private categoryRepository: CategoryRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    private createTransactionUseCase: CreateTransactionUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        transactions: (
          _parent: unknown,
          args: { filter?: TransactionFilter; pagination?: PaginationInput },
        ) => this.getTransactions(args.filter, args.pagination),
        transaction: (_parent: unknown, args: { id: number }) =>
          this.getTransactionById(args.id),
      },
      Mutation: {
        createTransaction: (
          _parent: unknown,
          args: { input: CreateTransactionInput },
        ) => this.createTransaction(args.input),
        updateTransactionCategory: (
          _parent: unknown,
          args: { input: UpdateCategoryInput },
        ) => this.updateTransactionCategory(args.input),
        updateTransactionBudget: (
          _parent: unknown,
          args: { input: UpdateBudgetInput },
        ) => this.updateTransactionBudget(args.input),
        verifyTransaction: (_parent: unknown, args: { id: number }) =>
          this.verifyTransaction(args.id),
      },
      Transaction: {
        account: (parent: TransactionGql) =>
          this.getTransactionAccount(parent.accountId),
        category: (parent: TransactionGql) =>
          this.getTransactionCategory(parent.categoryId),
        budget: (parent: TransactionGql) =>
          this.getTransactionBudget(parent.budgetId),
      },
    };
  }

  private async getTransactions(
    filter?: TransactionFilter,
    pagination?: PaginationInput,
  ) {
    const mappedFilter = this.mapFilter(filter);
    const mappedPagination = this.resolvePagination(pagination);

    const [records, totalCount] = await Promise.all([
      this.transactionRepository.findRecordsFiltered(
        mappedFilter,
        mappedPagination,
      ),
      this.transactionRepository.countFiltered(mappedFilter),
    ]);

    return {
      items: records.map(mapTransactionRecordToGql),
      totalCount,
      hasMore: mappedPagination.offset + mappedPagination.limit < totalCount,
    };
  }

  private async getTransactionById(id: number) {
    const record = await this.transactionRepository.findRecordById(id);
    return record ? mapTransactionRecordToGql(record) : null;
  }

  private async createTransaction(input: CreateTransactionInput) {
    const dto: CreateTransactionRequestDTO = {
      accountId: input.accountId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      description: input.description,
      counterpartyName: input.counterpartyName,
      counterpartyIban: input.counterpartyIban,
      mcc: input.mcc,
      notes: input.notes,
    };

    const transaction = await this.createTransactionUseCase.execute(dto);

    const dbId = transaction.dbId;
    if (dbId === null) {
      throw new Error('Transaction was not assigned a database ID');
    }

    const record = await this.transactionRepository.findRecordById(dbId);
    if (!record) {
      throw new Error(`Failed to retrieve created transaction: ${dbId}`);
    }

    return mapTransactionRecordToGql(record);
  }

  private async updateTransactionCategory(input: UpdateCategoryInput) {
    const categoryId = input.categoryId ?? null;

    if (categoryId !== null) {
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new Error(`Category not found with id: ${categoryId}`);
      }
    }

    const record = await this.transactionRepository.updateRecordCategory(
      input.id,
      categoryId,
    );
    if (!record) {
      throw new Error(`Transaction not found with id: ${input.id}`);
    }
    return mapTransactionRecordToGql(record);
  }

  private async updateTransactionBudget(input: UpdateBudgetInput) {
    const budgetId = input.budgetId ?? null;

    if (budgetId !== null) {
      const budget = await this.budgetRepository.findById(budgetId);
      if (!budget) {
        throw new Error(`Budget not found with id: ${budgetId}`);
      }
    }

    const record = await this.transactionRepository.updateRecordBudget(
      input.id,
      budgetId,
    );
    if (!record) {
      throw new Error(`Transaction not found with id: ${input.id}`);
    }
    return mapTransactionRecordToGql(record);
  }

  private async verifyTransaction(id: number) {
    const record = await this.transactionRepository.updateRecordStatus(
      id,
      CategorizationStatus.VERIFIED,
    );
    if (!record) {
      throw new Error(`Transaction not found with id: ${id}`);
    }
    return mapTransactionRecordToGql(record);
  }

  private async getTransactionAccount(accountId: number | null) {
    if (accountId === null) {
      return null;
    }
    const allAccounts = await this.accountRepository.findAll();
    const account = allAccounts.find((account) => account.dbId === accountId);
    return account ? mapAccountToGql(account) : null;
  }

  private async getTransactionCategory(categoryId: number | null) {
    if (categoryId === null) {
      return null;
    }
    const category = await this.categoryRepository.findById(categoryId);
    return category ? mapCategoryToGql(category) : null;
  }

  private async getTransactionBudget(budgetId: number | null) {
    if (budgetId === null) {
      return null;
    }
    const budget = await this.budgetRepository.findById(budgetId);
    return budget ? mapBudgetToGql(budget) : null;
  }

  private mapFilter(filter?: TransactionFilter): TransactionFilterParams {
    if (!filter) {
      return {};
    }
    return {
      accountId: filter.accountId ?? undefined,
      categoryId: filter.categoryId ?? undefined,
      budgetId: filter.budgetId ?? undefined,
      unbudgetedOnly: filter.unbudgetedOnly ?? undefined,
      accountRole: this.mapAccountRole(filter.accountRole),
      type: filter.type ?? undefined,
      categorizationStatus: filter.categorizationStatus ?? undefined,
      dateFrom: filter.dateFrom ?? undefined,
      dateTo: filter.dateTo ?? undefined,
      search: filter.search ?? undefined,
    };
  }

  private mapAccountRole(
    role?: 'OPERATIONAL' | 'SAVINGS',
  ): 'operational' | 'savings' | undefined {
    if (!role) {
      return undefined;
    }
    return role.toLowerCase() as 'operational' | 'savings';
  }

  private resolvePagination(pagination?: PaginationInput) {
    const limit = Math.min(pagination?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = pagination?.offset ?? 0;
    return { limit, offset };
  }
}
