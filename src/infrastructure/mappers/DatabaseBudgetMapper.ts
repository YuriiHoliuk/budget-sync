import { Budget, parseCadenceUnit } from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

export class DatabaseBudgetMapper {
  toEntity(row: BudgetRow): Budget {
    const currency = Currency.fromCode(row.currency);
    const amount = Money.create(row.targetAmount, currency);
    const cadenceUnit = parseCadenceUnit(row.cadenceUnit);
    const cadenceCount = row.cadenceCount ?? (cadenceUnit ? 1 : null);
    const cap = row.cap != null ? Money.create(row.cap, currency) : null;

    return Budget.create(
      {
        name: row.name,
        amount,
        cadenceUnit,
        cadenceCount,
        targetDate: row.targetDate ? new Date(row.targetDate) : null,
        startDate: row.startDate ? new Date(row.startDate) : null,
        endDate: row.endDate ? new Date(row.endDate) : null,
        isArchived: row.isArchived,
        cap,
        sortOrder: row.sortOrder ?? null,
        budgetGroupId: row.budgetGroupId ?? null,
        dbId: row.id,
      },
      row.name,
    );
  }

  toInsert(budget: Budget): NewBudgetRow {
    return {
      name: budget.name,
      currency: budget.amount.currency.code,
      targetAmount: budget.amount.amount,
      cadenceUnit: budget.cadenceUnit,
      cadenceCount: budget.cadenceCount,
      targetDate: budget.targetDate ? this.formatDate(budget.targetDate) : null,
      startDate: budget.startDate ? this.formatDate(budget.startDate) : null,
      endDate: budget.endDate ? this.formatDate(budget.endDate) : null,
      cap: budget.cap?.amount ?? null,
      sortOrder: budget.sortOrder,
      budgetGroupId: budget.budgetGroupId,
      isArchived: budget.isArchived,
    };
  }

  private formatDate(date: Date): string {
    const [dateStr] = date.toISOString().split('T');
    return dateStr ?? date.toISOString().slice(0, 10);
  }
}
