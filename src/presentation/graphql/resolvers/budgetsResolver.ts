import { ArchiveBudgetUseCase } from '@application/use-cases/ArchiveBudget.ts';
import type { CreateBudgetRequestDTO } from '@application/use-cases/CreateBudget.ts';
import { CreateBudgetUseCase } from '@application/use-cases/CreateBudget.ts';
import type { UpdateBudgetRequestDTO } from '@application/use-cases/UpdateBudget.ts';
import { UpdateBudgetUseCase } from '@application/use-cases/UpdateBudget.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { inject, injectable } from 'tsyringe';
import {
  GQL_TO_BUDGET_TYPE,
  GQL_TO_CADENCE,
  mapBudgetToGql,
  mapOptionalGqlEnum,
  toMinorUnits,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateBudgetInput {
  name: string;
  type: string;
  currency: string;
  targetAmount: number;
  targetCadence?: string | null;
  targetCadenceMonths?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface UpdateBudgetInput {
  id: number;
  name?: string | null;
  type?: string | null;
  currency?: string | null;
  targetAmount?: number | null;
  targetCadence?: string | null;
  targetCadenceMonths?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@injectable()
export class BudgetsResolver extends Resolver {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    private createBudgetUseCase: CreateBudgetUseCase,
    private updateBudgetUseCase: UpdateBudgetUseCase,
    private archiveBudgetUseCase: ArchiveBudgetUseCase,
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
      },
    };
  }

  private async getBudgets(activeOnly: boolean) {
    const budgets = activeOnly
      ? await this.budgetRepository.findActive(new Date())
      : await this.budgetRepository.findAll();
    return budgets.map(mapBudgetToGql);
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

  private mapCreateInput(input: CreateBudgetInput): CreateBudgetRequestDTO {
    return {
      name: input.name,
      type: GQL_TO_BUDGET_TYPE[input.type] ?? 'spending',
      currency: input.currency,
      targetAmount: toMinorUnits(input.targetAmount),
      targetCadence: input.targetCadence
        ? (GQL_TO_CADENCE[input.targetCadence] ?? null)
        : null,
      targetCadenceMonths: input.targetCadenceMonths ?? null,
      targetDate: input.targetDate ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    };
  }

  private mapUpdateInput(input: UpdateBudgetInput): UpdateBudgetRequestDTO {
    return {
      id: input.id,
      name: input.name ?? undefined,
      type: input.type
        ? (GQL_TO_BUDGET_TYPE[input.type] ?? undefined)
        : undefined,
      currency: input.currency ?? undefined,
      targetAmount:
        input.targetAmount != null
          ? toMinorUnits(input.targetAmount)
          : undefined,
      targetCadence: mapOptionalGqlEnum(input.targetCadence, GQL_TO_CADENCE),
      targetCadenceMonths:
        input.targetCadenceMonths !== undefined
          ? input.targetCadenceMonths
          : undefined,
      targetDate: input.targetDate !== undefined ? input.targetDate : undefined,
      startDate: input.startDate !== undefined ? input.startDate : undefined,
      endDate: input.endDate !== undefined ? input.endDate : undefined,
    };
  }
}
