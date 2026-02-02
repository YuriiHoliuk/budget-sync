import type { Budget } from '@domain/entities/Budget.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import type { GraphQLContext } from '@modules/graphql/types.ts';

const BUDGET_TYPE_TO_GQL: Record<string, string> = {
  spending: 'SPENDING',
  savings: 'SAVINGS',
  goal: 'GOAL',
  periodic: 'PERIODIC',
};

const CADENCE_TO_GQL: Record<string, string> = {
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
  custom: 'CUSTOM',
};

function mapBudgetToGql(budget: Budget) {
  return {
    id: budget.dbId,
    name: budget.name,
    type: BUDGET_TYPE_TO_GQL[budget.type] ?? 'SPENDING',
    currency: budget.amount.currency.code,
    targetAmount: budget.amount.toMajorUnits(),
    targetCadence: budget.targetCadence
      ? (CADENCE_TO_GQL[budget.targetCadence] ?? null)
      : null,
    targetCadenceMonths: budget.targetCadenceMonths,
    targetDate: budget.targetDate
      ? budget.targetDate.toISOString().slice(0, 10)
      : null,
    startDate: budget.startDate
      ? budget.startDate.toISOString().slice(0, 10)
      : null,
    endDate: budget.endDate ? budget.endDate.toISOString().slice(0, 10) : null,
    isArchived: budget.isArchived,
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
};
