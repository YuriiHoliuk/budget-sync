import { ArchiveBudgetUseCase } from '@application/use-cases/ArchiveBudget.ts';
import type { CreateBudgetRequestDTO } from '@application/use-cases/CreateBudget.ts';
import { CreateBudgetUseCase } from '@application/use-cases/CreateBudget.ts';
import type { UpdateBudgetRequestDTO } from '@application/use-cases/UpdateBudget.ts';
import { UpdateBudgetUseCase } from '@application/use-cases/UpdateBudget.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';
import {
  GQL_TO_BUDGET_TYPE,
  GQL_TO_CADENCE,
  mapBudgetToGql,
  mapOptionalGqlEnum,
  toMinorUnits,
} from '../mappers/index.ts';

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

function mapCreateInput(input: CreateBudgetInput): CreateBudgetRequestDTO {
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

function mapUpdateInput(input: UpdateBudgetInput): UpdateBudgetRequestDTO {
  return {
    id: input.id,
    name: input.name ?? undefined,
    type: input.type
      ? (GQL_TO_BUDGET_TYPE[input.type] ?? undefined)
      : undefined,
    currency: input.currency ?? undefined,
    targetAmount:
      input.targetAmount != null ? toMinorUnits(input.targetAmount) : undefined,
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

export const budgetsResolver = {
  Query: {
    budgets: async (
      _parent: unknown,
      args: { activeOnly: boolean },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<BudgetRepository>(
        BUDGET_REPOSITORY_TOKEN,
      );

      const allBudgets = args.activeOnly
        ? await repository.findActive(new Date())
        : await repository.findAll();

      return allBudgets.map(mapBudgetToGql);
    },

    budget: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<BudgetRepository>(
        BUDGET_REPOSITORY_TOKEN,
      );
      const budget = await repository.findById(args.id);
      return budget ? mapBudgetToGql(budget) : null;
    },
  },

  Mutation: {
    createBudget: async (
      _parent: unknown,
      args: { input: CreateBudgetInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(CreateBudgetUseCase);
      const budget = await useCase.execute(mapCreateInput(args.input));
      return mapBudgetToGql(budget);
    },

    updateBudget: async (
      _parent: unknown,
      args: { input: UpdateBudgetInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(UpdateBudgetUseCase);
      const budget = await useCase.execute(mapUpdateInput(args.input));
      return mapBudgetToGql(budget);
    },

    archiveBudget: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(ArchiveBudgetUseCase);
      const budget = await useCase.execute({ id: args.id });
      return mapBudgetToGql(budget);
    },
  },
};
