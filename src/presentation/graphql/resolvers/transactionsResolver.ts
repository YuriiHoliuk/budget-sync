import { BatchUpdateTransactionsUseCase } from '@application/use-cases/BatchUpdateTransactions.ts';
import { ConvertToTransferUseCase } from '@application/use-cases/ConvertToTransfer.ts';
import {
  type CreateTransactionRequestDTO,
  CreateTransactionUseCase,
} from '@application/use-cases/CreateTransaction.ts';
import { DeleteTransactionUseCase } from '@application/use-cases/DeleteTransaction.ts';
import { JoinTransactionsUseCase } from '@application/use-cases/JoinTransactions.ts';
import { MarkAsReturningUseCase } from '@application/use-cases/MarkAsReturning.ts';
import { RevertReturningUseCase } from '@application/use-cases/RevertReturning.ts';
import { RevertTransferUseCase } from '@application/use-cases/RevertTransfer.ts';
import {
  type SplitTransactionRequestDTO,
  SplitTransactionUseCase,
} from '@application/use-cases/SplitTransaction.ts';
import {
  ACCOUNT_REPOSITORY_TOKEN,
  type AccountRepository,
} from '@domain/repositories/AccountRepository.ts';
import {
  BANK_TRANSACTION_REPOSITORY_TOKEN,
  type BankTransactionRepository,
} from '@domain/repositories/BankTransactionRepository.ts';
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
  mapTransactionRecordToSiblingGql,
  type SiblingTransactionGql,
  type TransactionGql,
  toMajorUnits,
  toMajorUnitsOrNull,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface TransactionFilter {
  accountId?: number;
  categoryId?: number;
  budgetId?: number;
  uncategorizedOnly?: boolean;
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

interface UpdateNotesInput {
  id: number;
  notes?: string | null;
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
    @inject(BANK_TRANSACTION_REPOSITORY_TOKEN)
    private bankTransactionRepository: BankTransactionRepository,
    private createTransactionUseCase: CreateTransactionUseCase,
    private deleteTransactionUseCase: DeleteTransactionUseCase,
    private convertToTransferUseCase: ConvertToTransferUseCase,
    private revertTransferUseCase: RevertTransferUseCase,
    private markAsReturningUseCase: MarkAsReturningUseCase,
    private revertReturningUseCase: RevertReturningUseCase,
    private splitTransactionUseCase: SplitTransactionUseCase,
    private joinTransactionsUseCase: JoinTransactionsUseCase,
    private batchUpdateTransactionsUseCase: BatchUpdateTransactionsUseCase,
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
        deleteTransaction: (_parent: unknown, args: { id: number }) =>
          this.deleteTransaction(args.id),
        updateTransactionCategory: (
          _parent: unknown,
          args: { input: UpdateCategoryInput },
        ) => this.updateTransactionCategory(args.input),
        updateTransactionBudget: (
          _parent: unknown,
          args: { input: UpdateBudgetInput },
        ) => this.updateTransactionBudget(args.input),
        updateTransactionNotes: (
          _parent: unknown,
          args: { input: UpdateNotesInput },
        ) => this.updateTransactionNotes(args.input),
        verifyTransaction: (_parent: unknown, args: { id: number }) =>
          this.verifyTransaction(args.id),
        markAsTransfer: (
          _parent: unknown,
          args: {
            outgoingTransactionId: number;
            incomingTransactionId: number;
          },
        ) =>
          this.markAsTransfer(
            args.outgoingTransactionId,
            args.incomingTransactionId,
          ),
        unmarkTransfer: (
          _parent: unknown,
          args: {
            outgoingTransactionId: number;
            incomingTransactionId: number;
          },
        ) =>
          this.unmarkTransfer(
            args.outgoingTransactionId,
            args.incomingTransactionId,
          ),
        convertToTransfer: (
          _parent: unknown,
          args: {
            input: { transactionId: number; destinationAccountId: number };
          },
        ) => this.convertToTransfer(args.input),
        revertTransfer: (_parent: unknown, args: { transactionId: number }) =>
          this.revertTransfer(args.transactionId),
        markAsReturning: (
          _parent: unknown,
          args: {
            input: {
              creditTransactionIds: number[];
              debitTransactionIds: number[];
            };
          },
        ) => this.markAsReturning(args.input),
        revertReturning: (_parent: unknown, args: { transactionId: number }) =>
          this.revertReturning(args.transactionId),
        splitTransaction: (
          _parent: unknown,
          args: {
            input: {
              transactionId: number;
              parts: Array<{
                amount: number;
                description?: string | null;
                categoryId?: number | null;
                budgetId?: number | null;
                notes?: string | null;
              }>;
            };
          },
        ) => this.splitTransaction(args.input),
        joinTransactions: (
          _parent: unknown,
          args: {
            input: {
              targetTransactionId: number;
              sourceTransactionId: number;
            };
          },
        ) => this.joinTransactions(args.input),
        batchUpdateTransactions: (
          _parent: unknown,
          args: {
            input: {
              ids: number[];
              categoryId?: number | null;
              setCategory?: boolean | null;
              budgetId?: number | null;
              setBudget?: boolean | null;
              verify?: boolean | null;
            };
          },
        ) => this.batchUpdateTransactions(args.input),
      },
      Transaction: {
        account: (parent: TransactionGql) =>
          this.getTransactionAccount(parent.accountId),
        category: (parent: TransactionGql) =>
          this.getTransactionCategory(parent.categoryId),
        budget: (parent: TransactionGql) =>
          this.getTransactionBudget(parent.budgetId),
        bankTransactions: (parent: TransactionGql) =>
          this.getBankTransactions(parent.id),
        transferPair: (parent: TransactionGql) =>
          this.getTransferPairInfo(parent.id),
        returningInfo: (parent: TransactionGql) =>
          this.getReturningInfo(parent.id, parent.type),
        siblingTransactions: (parent: TransactionGql) =>
          this.getSiblingTransactions(parent.id),
      },
      SiblingTransaction: {
        category: (parent: SiblingTransactionGql) =>
          this.getTransactionCategory(parent.categoryId),
        budget: (parent: SiblingTransactionGql) =>
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

  private deleteTransaction(id: number): Promise<boolean> {
    return this.deleteTransactionUseCase.execute({ id });
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

  private async updateTransactionNotes(input: UpdateNotesInput) {
    const notes = input.notes ?? null;

    const record = await this.transactionRepository.updateRecordNotes(
      input.id,
      notes,
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

  private async getBankTransactions(transactionId: number) {
    const bankTxns =
      await this.bankTransactionRepository.findByTransactionId(transactionId);

    const bankTxnIds = bankTxns.map((bankTxn) => bankTxn.id);
    const allReturns =
      bankTxnIds.length > 0
        ? await this.bankTransactionRepository.findReturnsByBankTransactionIds(
            bankTxnIds,
          )
        : [];

    return bankTxns.map((bankTxn) => ({
      id: bankTxn.id,
      externalId: bankTxn.externalId,
      date: bankTxn.date.toISOString(),
      amount: toMajorUnits(bankTxn.amount.amount),
      currency: bankTxn.amount.currency.code,
      type: bankTxn.type,
      mcc: bankTxn.mcc ?? null,
      bankDescription: bankTxn.bankDescription ?? null,
      counterparty: bankTxn.counterparty ?? null,
      counterpartyIban: bankTxn.counterpartyIban ?? null,
      balanceAfter: toMajorUnitsOrNull(bankTxn.balanceAfter?.amount ?? null),
      cashback: toMajorUnitsOrNull(bankTxn.cashback?.amount ?? null),
      commission: toMajorUnitsOrNull(bankTxn.commission?.amount ?? null),
      hold: bankTxn.hold,
      receiptId: bankTxn.receiptId ?? null,
      returnHistory: allReturns
        .filter(
          (returnRecord) =>
            returnRecord.originalBankTransactionId === bankTxn.id ||
            returnRecord.returningBankTransactionId === bankTxn.id,
        )
        .map((returnRecord) => ({
          originalBankTransactionId: returnRecord.originalBankTransactionId,
          returningBankTransactionId: returnRecord.returningBankTransactionId,
          amount: toMajorUnits(returnRecord.amount),
          createdAt: returnRecord.createdAt.toISOString(),
        })),
    }));
  }

  private async markAsTransfer(
    outgoingTransactionId: number,
    incomingTransactionId: number,
  ) {
    await Promise.all([
      this.transactionRepository.updateRecordType(
        outgoingTransactionId,
        'transfer',
      ),
      this.transactionRepository.updateRecordType(
        incomingTransactionId,
        'transfer',
      ),
    ]);
    await this.transactionRepository.createTransferPair(
      outgoingTransactionId,
      incomingTransactionId,
    );
    return true;
  }

  private async unmarkTransfer(
    outgoingTransactionId: number,
    incomingTransactionId: number,
  ) {
    await this.transactionRepository.deleteTransferPair(
      outgoingTransactionId,
      incomingTransactionId,
    );
    await Promise.all([
      this.transactionRepository.updateRecordType(
        outgoingTransactionId,
        'debit',
      ),
      this.transactionRepository.updateRecordType(
        incomingTransactionId,
        'credit',
      ),
    ]);
    return true;
  }

  private async convertToTransfer(input: {
    transactionId: number;
    destinationAccountId: number;
  }) {
    const result = await this.convertToTransferUseCase.execute(input);

    const [sourceRecord, counterpartRecord] = await Promise.all([
      this.transactionRepository.findRecordById(result.sourceTransactionId),
      this.transactionRepository.findRecordById(
        result.counterpartTransactionId,
      ),
    ]);

    if (!sourceRecord || !counterpartRecord) {
      throw new Error('Failed to retrieve converted transactions');
    }

    return {
      sourceTransaction: mapTransactionRecordToGql(sourceRecord),
      counterpartTransaction: mapTransactionRecordToGql(counterpartRecord),
    };
  }

  private async revertTransfer(transactionId: number) {
    await this.revertTransferUseCase.execute({ transactionId });

    const record =
      await this.transactionRepository.findRecordById(transactionId);
    if (!record) {
      throw new Error(`Transaction not found with id: ${transactionId}`);
    }
    return mapTransactionRecordToGql(record);
  }

  private async markAsReturning(input: {
    creditTransactionIds: number[];
    debitTransactionIds: number[];
  }) {
    const result = await this.markAsReturningUseCase.execute(input);

    let survivingTransaction = null;
    if (result.survivingTransactionId !== null) {
      const record = await this.transactionRepository.findRecordById(
        result.survivingTransactionId,
      );
      if (record) {
        survivingTransaction = mapTransactionRecordToGql(record);
      }
    }

    return {
      type: result.type.toUpperCase(),
      survivingTransaction,
      newSurvivingAmount:
        result.newSurvivingAmount !== null
          ? toMajorUnits(result.newSurvivingAmount)
          : null,
      totalDebitAmount: toMajorUnits(result.totalDebitAmount),
      totalCreditAmount: toMajorUnits(result.totalCreditAmount),
    };
  }

  private async revertReturning(transactionId: number) {
    const result = await this.revertReturningUseCase.execute({ transactionId });

    const [originalRecord, ...createdRecords] = await Promise.all([
      this.transactionRepository.findRecordById(result.originalTransactionId),
      ...result.createdTransactionIds.map((id) =>
        this.transactionRepository.findRecordById(id),
      ),
    ]);

    if (!originalRecord) {
      throw new Error(`Transaction not found with id: ${transactionId}`);
    }

    return {
      transaction: mapTransactionRecordToGql(originalRecord),
      createdTransactions: createdRecords
        .filter(
          (record): record is NonNullable<typeof record> => record !== null,
        )
        .map(mapTransactionRecordToGql),
    };
  }

  private async splitTransaction(input: {
    transactionId: number;
    parts: Array<{
      amount: number;
      description?: string | null;
      categoryId?: number | null;
      budgetId?: number | null;
      notes?: string | null;
    }>;
  }) {
    const dto: SplitTransactionRequestDTO = {
      transactionId: input.transactionId,
      parts: input.parts.map((part) => ({
        amount: part.amount,
        description: part.description ?? null,
        categoryId: part.categoryId ?? null,
        budgetId: part.budgetId ?? null,
        notes: part.notes ?? null,
      })),
    };

    const result = await this.splitTransactionUseCase.execute(dto);

    const [sourceRecord, ...splitRecords] = await Promise.all([
      this.transactionRepository.findRecordById(result.sourceTransactionId),
      ...result.splitTransactionIds.map((id) =>
        this.transactionRepository.findRecordById(id),
      ),
    ]);

    if (!sourceRecord) {
      throw new Error(
        `Failed to retrieve source transaction: ${result.sourceTransactionId}`,
      );
    }

    const validSplitRecords = splitRecords.filter(
      (record): record is NonNullable<typeof record> => record !== null,
    );

    return {
      sourceTransaction: mapTransactionRecordToGql(sourceRecord),
      splitTransactions: validSplitRecords.map(mapTransactionRecordToGql),
    };
  }

  private async joinTransactions(input: {
    targetTransactionId: number;
    sourceTransactionId: number;
  }) {
    const result = await this.joinTransactionsUseCase.execute(input);

    const record = await this.transactionRepository.findRecordById(
      result.targetTransactionId,
    );
    if (!record) {
      throw new Error(
        `Failed to retrieve target transaction: ${result.targetTransactionId}`,
      );
    }

    return mapTransactionRecordToGql(record);
  }

  private async batchUpdateTransactions(input: {
    ids: number[];
    categoryId?: number | null;
    setCategory?: boolean | null;
    budgetId?: number | null;
    setBudget?: boolean | null;
    verify?: boolean | null;
  }) {
    const result = await this.batchUpdateTransactionsUseCase.execute({
      ids: input.ids,
      categoryId: input.categoryId ?? null,
      setCategory: input.setCategory ?? false,
      budgetId: input.budgetId ?? null,
      setBudget: input.setBudget ?? false,
      verify: input.verify ?? false,
    });

    const records = await Promise.all(
      result.transactionIds.map((id) =>
        this.transactionRepository.findRecordById(id),
      ),
    );

    const validRecords = records.filter(
      (record): record is NonNullable<typeof record> => record !== null,
    );

    return {
      updatedCount: result.updatedCount,
      transactions: validRecords.map(mapTransactionRecordToGql),
    };
  }

  private async getSiblingTransactions(transactionId: number) {
    const siblings =
      await this.transactionRepository.findSiblingTransactions(transactionId);
    return siblings.map(mapTransactionRecordToSiblingGql);
  }

  private async getReturningInfo(transactionId: number, type: string) {
    if (type === 'TRANSFER') {
      return null;
    }

    const bankTxs =
      await this.bankTransactionRepository.findByTransactionId(transactionId);

    const foreignBankTxs =
      type === 'DEBIT'
        ? bankTxs.filter((bankTx) => bankTx.isCredit)
        : bankTxs.filter((bankTx) => bankTx.isDebit);

    if (foreignBankTxs.length === 0) {
      return null;
    }

    const returningAmount = foreignBankTxs.reduce(
      (sum, bankTx) => sum + Math.abs(bankTx.amount.amount),
      0,
    );

    return {
      isRevertible: true,
      returningAmount: toMajorUnits(returningAmount),
    };
  }

  private async getTransferPairInfo(transactionId: number) {
    const pair =
      await this.transactionRepository.findTransferPairByTransactionId(
        transactionId,
      );
    if (!pair) {
      return null;
    }

    const pairedId =
      pair.outgoingTransactionId === transactionId
        ? pair.incomingTransactionId
        : pair.outgoingTransactionId;

    const pairedRecord =
      await this.transactionRepository.findRecordById(pairedId);

    let pairedAccountName: string | null = null;
    if (pairedRecord?.accountId) {
      const allAccounts = await this.accountRepository.findAll();
      const pairedAccount = allAccounts.find(
        (account) => account.dbId === pairedRecord.accountId,
      );
      pairedAccountName = pairedAccount?.name ?? null;
    }

    const isRevertible =
      pairedRecord?.externalId?.startsWith('transfer-counterpart-') ?? false;

    return {
      pairedTransactionId: pairedId,
      pairedAccountName,
      isRevertible,
    };
  }

  private mapFilter(filter?: TransactionFilter): TransactionFilterParams {
    if (!filter) {
      return {};
    }
    return {
      ...this.mapCoreFilters(filter),
      accountRole: this.mapAccountRole(filter.accountRole),
      type: filter.type ?? undefined,
      categorizationStatus: filter.categorizationStatus ?? undefined,
      dateFrom: filter.dateFrom ?? undefined,
      dateTo: filter.dateTo ?? undefined,
      search: filter.search ?? undefined,
    };
  }

  private mapCoreFilters(
    filter: TransactionFilter,
  ): Pick<
    TransactionFilterParams,
    | 'accountId'
    | 'categoryId'
    | 'uncategorizedOnly'
    | 'budgetId'
    | 'unbudgetedOnly'
  > {
    return {
      accountId: filter.accountId ?? undefined,
      categoryId: filter.categoryId ?? undefined,
      uncategorizedOnly: filter.uncategorizedOnly ?? undefined,
      budgetId: filter.budgetId ?? undefined,
      unbudgetedOnly: filter.unbudgetedOnly ?? undefined,
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
