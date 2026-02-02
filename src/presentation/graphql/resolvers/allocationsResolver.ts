import type { CreateAllocationRequestDTO } from '@application/use-cases/CreateAllocation.ts';
import { CreateAllocationUseCase } from '@application/use-cases/CreateAllocation.ts';
import { DeleteAllocationUseCase } from '@application/use-cases/DeleteAllocation.ts';
import type { MoveFundsRequestDTO } from '@application/use-cases/MoveFunds.ts';
import { MoveFundsUseCase } from '@application/use-cases/MoveFunds.ts';
import type { UpdateAllocationRequestDTO } from '@application/use-cases/UpdateAllocation.ts';
import { UpdateAllocationUseCase } from '@application/use-cases/UpdateAllocation.ts';
import type { Allocation } from '@domain/entities/Allocation.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

interface AllocationGql {
  id: number | null;
  budgetId: number;
  amount: number;
  currency: string;
  period: string;
  date: string;
  notes: string | null;
}

function mapAllocationToGql(allocation: Allocation): AllocationGql {
  return {
    id: allocation.dbId,
    budgetId: allocation.budgetId,
    amount: allocation.amount.toMajorUnits(),
    currency: allocation.amount.currency.code,
    period: allocation.period,
    date: allocation.date.toISOString().slice(0, 10),
    notes: allocation.notes,
  };
}

/** Convert major units (e.g. 100.50 UAH) to minor units (10050 kopecks) */
function toMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * 100);
}

interface CreateAllocationInput {
  budgetId: number;
  amount: number;
  currency: string;
  period: string;
  date?: string | null;
  notes?: string | null;
}

interface UpdateAllocationInput {
  id: number;
  budgetId?: number | null;
  amount?: number | null;
  currency?: string | null;
  period?: string | null;
  date?: string | null;
  notes?: string | null;
}

interface MoveFundsInput {
  sourceBudgetId: number;
  destBudgetId: number;
  amount: number;
  currency: string;
  period: string;
  date?: string | null;
  notes?: string | null;
}

function mapCreateInput(
  input: CreateAllocationInput,
): CreateAllocationRequestDTO {
  return {
    budgetId: input.budgetId,
    amount: toMinorUnits(input.amount),
    currency: input.currency,
    period: input.period,
    date: input.date ?? undefined,
    notes: input.notes ?? null,
  };
}

function mapUpdateInput(
  input: UpdateAllocationInput,
): UpdateAllocationRequestDTO {
  return {
    id: input.id,
    budgetId: input.budgetId ?? undefined,
    amount: input.amount != null ? toMinorUnits(input.amount) : undefined,
    currency: input.currency ?? undefined,
    period: input.period ?? undefined,
    date: input.date ?? undefined,
    notes: input.notes !== undefined ? input.notes : undefined,
  };
}

function mapMoveFundsInput(input: MoveFundsInput): MoveFundsRequestDTO {
  return {
    sourceBudgetId: input.sourceBudgetId,
    destBudgetId: input.destBudgetId,
    amount: toMinorUnits(input.amount),
    currency: input.currency,
    period: input.period,
    date: input.date ?? undefined,
    notes: input.notes ?? null,
  };
}

export const allocationsResolver = {
  Query: {
    allocations: async (
      _parent: unknown,
      args: { budgetId?: number; period?: string },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<AllocationRepository>(
        ALLOCATION_REPOSITORY_TOKEN,
      );

      const results = await resolveAllocations(repository, args);
      return results.map(mapAllocationToGql);
    },

    allocation: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<AllocationRepository>(
        ALLOCATION_REPOSITORY_TOKEN,
      );
      const allocation = await repository.findById(args.id);
      return allocation ? mapAllocationToGql(allocation) : null;
    },
  },

  Mutation: {
    createAllocation: async (
      _parent: unknown,
      args: { input: CreateAllocationInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(CreateAllocationUseCase);
      const allocation = await useCase.execute(mapCreateInput(args.input));
      return mapAllocationToGql(allocation);
    },

    updateAllocation: async (
      _parent: unknown,
      args: { input: UpdateAllocationInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(UpdateAllocationUseCase);
      const allocation = await useCase.execute(mapUpdateInput(args.input));
      return mapAllocationToGql(allocation);
    },

    deleteAllocation: async (
      _parent: unknown,
      args: { id: number },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(DeleteAllocationUseCase);
      await useCase.execute({ id: args.id });
      return true;
    },

    moveFunds: async (
      _parent: unknown,
      args: { input: MoveFundsInput },
      context: GraphQLContext,
    ) => {
      const useCase = context.container.resolve(MoveFundsUseCase);
      const result = await useCase.execute(mapMoveFundsInput(args.input));
      return {
        sourceAllocation: mapAllocationToGql(result.sourceAllocation),
        destAllocation: mapAllocationToGql(result.destAllocation),
      };
    },
  },

  Allocation: {
    budget: async (
      parent: AllocationGql,
      _args: unknown,
      context: GraphQLContext,
    ) => {
      const repository = context.container.resolve<BudgetRepository>(
        BUDGET_REPOSITORY_TOKEN,
      );
      const budget = await repository.findById(parent.budgetId);
      if (!budget) {
        return null;
      }
      // Return raw budget fields matching Budget type
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

function resolveAllocations(
  repository: AllocationRepository,
  args: { budgetId?: number; period?: string },
): Promise<Allocation[]> {
  if (args.budgetId !== undefined && args.period !== undefined) {
    return repository.findByBudgetAndPeriod(args.budgetId, args.period);
  }
  if (args.budgetId !== undefined) {
    return repository.findByBudgetId(args.budgetId);
  }
  if (args.period !== undefined) {
    return repository.findByPeriod(args.period);
  }
  return repository.findAll();
}
