import { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type {
  BudgetTargetRow,
  NewBudgetTargetRow,
} from '@modules/database/types.ts';

export class DatabaseBudgetTargetMapper {
  toEntity(row: BudgetTargetRow): BudgetTarget {
    const currency = Currency.UAH;
    const targetAmount = Money.create(row.targetAmount, currency);

    return BudgetTarget.create(
      {
        budgetId: row.budgetId,
        targetAmount,
        effectiveFrom: row.effectiveFrom,
        dbId: row.id,
      },
      `${row.budgetId}-${row.effectiveFrom}`,
    );
  }

  toInsert(target: BudgetTarget): NewBudgetTargetRow {
    return {
      budgetId: target.budgetId,
      targetAmount: target.targetAmount.amount,
      effectiveFrom: target.effectiveFrom,
    };
  }
}
