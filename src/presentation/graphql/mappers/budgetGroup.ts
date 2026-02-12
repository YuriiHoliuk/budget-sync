import type { BudgetGroup } from '@domain/entities/BudgetGroup.ts';

export interface BudgetGroupGql {
  id: number | null;
  name: string;
  sortOrder: string | null;
}

export function mapBudgetGroupToGql(group: BudgetGroup): BudgetGroupGql {
  return {
    id: group.dbId,
    name: group.name,
    sortOrder: group.sortOrder,
  };
}
