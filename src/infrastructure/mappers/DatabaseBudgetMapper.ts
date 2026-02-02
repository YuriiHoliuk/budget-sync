import {
  Budget,
  type BudgetType,
  type TargetCadence,
} from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

const VALID_BUDGET_TYPES = new Set(['spending', 'savings', 'goal', 'periodic']);
const VALID_CADENCES = new Set(['monthly', 'yearly', 'custom']);

export class DatabaseBudgetMapper {
  toEntity(row: BudgetRow): Budget {
    const currency = Currency.fromCode(row.currency);
    const amount = Money.create(row.targetAmount, currency);
    const budgetType = VALID_BUDGET_TYPES.has(row.type)
      ? (row.type as BudgetType)
      : 'spending';
    const cadence =
      row.targetCadence && VALID_CADENCES.has(row.targetCadence)
        ? (row.targetCadence as TargetCadence)
        : null;

    return Budget.create(
      {
        name: row.name,
        type: budgetType,
        amount,
        targetCadence: cadence,
        targetCadenceMonths: row.targetCadenceMonths ?? null,
        targetDate: row.targetDate ? new Date(row.targetDate) : null,
        startDate: row.startDate ? new Date(row.startDate) : null,
        endDate: row.endDate ? new Date(row.endDate) : null,
        isArchived: row.isArchived,
        dbId: row.id,
      },
      row.name,
    );
  }

  toInsert(budget: Budget): NewBudgetRow {
    return {
      name: budget.name,
      type: budget.type,
      currency: budget.amount.currency.code,
      targetAmount: budget.amount.amount,
      targetCadence: budget.targetCadence,
      targetCadenceMonths: budget.targetCadenceMonths,
      targetDate: budget.targetDate ? this.formatDate(budget.targetDate) : null,
      startDate: budget.startDate ? this.formatDate(budget.startDate) : null,
      endDate: budget.endDate ? this.formatDate(budget.endDate) : null,
      isArchived: budget.isArchived,
    };
  }

  private formatDate(date: Date): string {
    const [dateStr] = date.toISOString().split('T');
    return dateStr ?? date.toISOString().slice(0, 10);
  }
}
