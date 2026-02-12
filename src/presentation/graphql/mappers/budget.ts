import type { Budget, CadenceUnit } from '@domain/entities/Budget.ts';

export const CADENCE_UNIT_TO_GQL: Record<string, string> = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
};

export const GQL_TO_CADENCE_UNIT: Record<string, CadenceUnit> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

export interface BudgetGql {
  id: number | null;
  name: string;
  currency: string;
  targetAmount: number;
  cadenceUnit: string | null;
  cadenceCount: number | null;
  targetDate: string | null;
  startDate: string | null;
  endDate: string | null;
  isArchived: boolean;
  cap: number | null;
  sortOrder: string | null;
  budgetGroupId: number | null;
}

export function mapBudgetToGql(budget: Budget): BudgetGql {
  return {
    id: budget.dbId,
    name: budget.name,
    currency: budget.amount.currency.code,
    targetAmount: budget.amount.toMajorUnits(),
    cadenceUnit: budget.cadenceUnit
      ? (CADENCE_UNIT_TO_GQL[budget.cadenceUnit] ?? null)
      : null,
    cadenceCount: budget.cadenceCount,
    targetDate: budget.targetDate
      ? budget.targetDate.toISOString().slice(0, 10)
      : null,
    startDate: budget.startDate
      ? budget.startDate.toISOString().slice(0, 10)
      : null,
    endDate: budget.endDate ? budget.endDate.toISOString().slice(0, 10) : null,
    isArchived: budget.isArchived,
    cap: budget.cap?.toMajorUnits() ?? null,
    sortOrder: budget.sortOrder,
    budgetGroupId: budget.budgetGroupId,
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
