import { Budget } from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

export class DatabaseBudgetMapper {
  toEntity(row: BudgetRow): Budget {
    const currency = Currency.fromCode(row.currency);
    const amount = Money.create(row.targetAmount, currency);

    return Budget.create(
      {
        name: row.name,
        amount,
        startDate: row.startDate ? new Date(row.startDate) : new Date(0),
        endDate: row.endDate ? new Date(row.endDate) : new Date('2099-12-31'),
        dbId: row.id,
      },
      row.name,
    );
  }

  toInsert(budget: Budget): NewBudgetRow {
    return {
      name: budget.name,
      type: 'spending',
      currency: budget.amount.currency.code,
      targetAmount: budget.amount.amount,
      targetCadence: null,
      targetCadenceMonths: null,
      targetDate: null,
      startDate:
        budget.startDate.getTime() > 0
          ? this.formatDate(budget.startDate)
          : null,
      endDate:
        budget.endDate.getFullYear() < 2099
          ? this.formatDate(budget.endDate)
          : null,
      isArchived: false,
    };
  }

  private formatDate(date: Date): string {
    const [dateStr] = date.toISOString().split('T');
    return dateStr ?? date.toISOString().slice(0, 10);
  }
}
