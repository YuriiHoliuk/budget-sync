import { ArchiveBudgetUseCase } from '@application/use-cases/ArchiveBudget.ts';
import type { CreateBudgetRequestDTO } from '@application/use-cases/CreateBudget.ts';
import { CreateBudgetUseCase } from '@application/use-cases/CreateBudget.ts';
import type { ReorderBudgetRequestDTO } from '@application/use-cases/ReorderBudget.ts';
import { ReorderBudgetUseCase } from '@application/use-cases/ReorderBudget.ts';
import type { UpdateBudgetRequestDTO } from '@application/use-cases/UpdateBudget.ts';
import { UpdateBudgetUseCase } from '@application/use-cases/UpdateBudget.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import {
  TRANSACTION_REPOSITORY_TOKEN,
  type TransactionRepository,
} from '@domain/repositories/TransactionRepository.ts';
import { inject, injectable } from 'tsyringe';
import {
  GQL_TO_CADENCE_UNIT,
  mapBudgetToGql,
  toMinorUnits,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateBudgetInput {
  name: string;
  currency: string;
  targetAmount: number;
  cadenceUnit?: string | null;
  cadenceCount?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cap?: number | null;
  budgetGroupId?: number | null;
}

interface UpdateBudgetInput {
  id: number;
  /** YYYY-MM format. Required for endDate validation and target history. */
  month: string;
  name?: string | null;
  targetAmount?: number | null;
  endDate?: string | null;
  cap?: number | null;
  budgetGroupId?: number | null;
}

interface ReorderBudgetInput {
  budgetId: number;
  afterBudgetId?: number | null;
  beforeBudgetId?: number | null;
  budgetGroupId?: number | null;
}

@injectable()
export class BudgetsResolver extends Resolver {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepository: TransactionRepository,
    private createBudgetUseCase: CreateBudgetUseCase,
    private updateBudgetUseCase: UpdateBudgetUseCase,
    private archiveBudgetUseCase: ArchiveBudgetUseCase,
    private reorderBudgetUseCase: ReorderBudgetUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        budgets: (_parent: unknown, args: { activeOnly: boolean }) =>
          this.getBudgets(args.activeOnly),
        budget: (_parent: unknown, args: { id: number }) =>
          this.getBudgetById(args.id),
      },
      Mutation: {
        createBudget: (_parent: unknown, args: { input: CreateBudgetInput }) =>
          this.createBudget(args.input),
        updateBudget: (_parent: unknown, args: { input: UpdateBudgetInput }) =>
          this.updateBudget(args.input),
        archiveBudget: (_parent: unknown, args: { id: number }) =>
          this.archiveBudget(args.id),
        reorderBudget: (
          _parent: unknown,
          args: { input: ReorderBudgetInput },
        ) => this.reorderBudget(args.input),
      },
    };
  }

  private async getBudgets(activeOnly: boolean) {
    const [budgets, counts] = await Promise.all([
      activeOnly
        ? this.budgetRepository.findActive(new Date())
        : this.budgetRepository.findAll(),
      this.transactionRepository.countByBudgetId(),
    ]);
    return budgets.map((budget) => ({
      ...mapBudgetToGql(budget),
      transactionCount: counts.get(budget.dbId ?? 0) ?? 0,
    }));
  }

  private async getBudgetById(id: number) {
    const budget = await this.budgetRepository.findById(id);
    return budget ? mapBudgetToGql(budget) : null;
  }

  private async createBudget(input: CreateBudgetInput) {
    const budget = await this.createBudgetUseCase.execute(
      this.mapCreateInput(input),
    );
    return mapBudgetToGql(budget);
  }

  private async updateBudget(input: UpdateBudgetInput) {
    const budget = await this.updateBudgetUseCase.execute(
      this.mapUpdateInput(input),
    );
    return mapBudgetToGql(budget);
  }

  private async archiveBudget(id: number) {
    const budget = await this.archiveBudgetUseCase.execute({ id });
    return mapBudgetToGql(budget);
  }

  private async reorderBudget(input: ReorderBudgetInput) {
    const budget = await this.reorderBudgetUseCase.execute(
      this.mapReorderInput(input),
    );
    return mapBudgetToGql(budget);
  }

  private mapCreateInput(input: CreateBudgetInput): CreateBudgetRequestDTO {
    return {
      name: input.name,
      currency: input.currency,
      targetAmount: toMinorUnits(input.targetAmount),
      cadenceUnit: input.cadenceUnit
        ? (GQL_TO_CADENCE_UNIT[input.cadenceUnit] ?? null)
        : null,
      cadenceCount: input.cadenceCount ?? null,
      targetDate: input.targetDate ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      cap: input.cap != null ? toMinorUnits(input.cap) : null,
      budgetGroupId: input.budgetGroupId ?? null,
    };
  }

  private mapUpdateInput(input: UpdateBudgetInput): UpdateBudgetRequestDTO {
    return {
      id: input.id,
      month: input.month,
      name: input.name ?? undefined,
      targetAmount:
        input.targetAmount != null
          ? toMinorUnits(input.targetAmount)
          : undefined,
      endDate: input.endDate,
      cap: this.mapOptionalMoney(input.cap),
      budgetGroupId: input.budgetGroupId,
    };
  }

  private mapOptionalMoney(
    value: number | null | undefined,
  ): number | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value != null ? toMinorUnits(value) : null;
  }

  private mapReorderInput(input: ReorderBudgetInput): ReorderBudgetRequestDTO {
    return {
      budgetId: input.budgetId,
      afterBudgetId: input.afterBudgetId ?? null,
      beforeBudgetId: input.beforeBudgetId ?? null,
      budgetGroupId: input.budgetGroupId,
    };
  }
}
