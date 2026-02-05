import type {
  Budget,
  BudgetType,
  TargetCadence,
} from '@domain/entities/Budget.ts';

export const BUDGET_TYPE_TO_GQL: Record<string, string> = {
  spending: 'SPENDING',
  savings: 'SAVINGS',
  goal: 'GOAL',
  periodic: 'PERIODIC',
};

export const GQL_TO_BUDGET_TYPE: Record<string, BudgetType> = {
  SPENDING: 'spending',
  SAVINGS: 'savings',
  GOAL: 'goal',
  PERIODIC: 'periodic',
};

export const CADENCE_TO_GQL: Record<string, string> = {
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
  custom: 'CUSTOM',
};

export const GQL_TO_CADENCE: Record<string, TargetCadence> = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  CUSTOM: 'custom',
};

export interface BudgetGql {
  id: number | null;
  name: string;
  type: string;
  currency: string;
  targetAmount: number;
  targetCadence: string | null;
  targetCadenceMonths: number | null;
  targetDate: string | null;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
}

export function mapBudgetToGql(budget: Budget): BudgetGql {
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

/**
 * Convert a nullable GQL enum value to its domain equivalent, or undefined if not provided.
 * Useful for update operations where undefined means "don't change".
 */
export function mapOptionalGqlEnum<T>(
  value: string | null | undefined,
  lookup: Record<string, T>,
): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return lookup[value] ?? null;
}
