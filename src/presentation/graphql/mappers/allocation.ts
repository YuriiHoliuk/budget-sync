import type { Allocation } from '@domain/entities/Allocation.ts';

export interface AllocationGql {
  id: number | null;
  budgetId: number;
  amount: number;
  currency: string;
  period: string;
  date: string;
  notes: string | null;
}

export function mapAllocationToGql(allocation: Allocation): AllocationGql {
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
