import {
  Budget,
  type CadenceUnit,
  parseCadenceUnit,
} from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

/**
 * Converts old targetCadence values to new cadenceUnit.
 * Used for backward compatibility during migration period.
 */
function convertOldCadenceToUnit(
  targetCadence: string | null,
): CadenceUnit | null {
  if (!targetCadence) {
    return null;
  }
  switch (targetCadence) {
    case 'monthly':
      return 'month';
    case 'yearly':
      return 'year';
    case 'custom':
      return 'month'; // custom uses targetCadenceMonths as count
    default:
      return null;
  }
}

/**
 * Converts new cadenceUnit to old targetCadence format.
 * Used for dual-write during migration period.
 */
function convertUnitToOldCadence(
  cadenceUnit: CadenceUnit | null,
  cadenceCount: number | null,
): string | null {
  if (!cadenceUnit) {
    return null;
  }
  switch (cadenceUnit) {
    case 'month':
      return cadenceCount === 1 ? 'monthly' : 'custom';
    case 'year':
      return 'yearly';
    case 'day':
    case 'week':
      // Old system doesn't support day/week, use custom as fallback
      return 'custom';
    default:
      return null;
  }
}

export class DatabaseBudgetMapper {
  toEntity(row: BudgetRow): Budget {
    const currency = Currency.fromCode(row.currency);
    const amount = Money.create(row.targetAmount, currency);

    // Dual-read: prefer new columns, fallback to old
    const cadenceUnit =
      parseCadenceUnit(row.cadenceUnit) ??
      convertOldCadenceToUnit(row.targetCadence);

    const cadenceCount =
      row.cadenceCount ?? row.targetCadenceMonths ?? (cadenceUnit ? 1 : null);

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
    // Dual-write: write to both old and new columns
    const oldCadence = convertUnitToOldCadence(
      budget.cadenceUnit,
      budget.cadenceCount,
    );

    return {
      name: budget.name,
      // Old column - kept for backward compatibility
      type: 'spending', // Default to spending during migration
      currency: budget.amount.currency.code,
      targetAmount: budget.amount.amount,
      // Old columns - kept for backward compatibility
      targetCadence: oldCadence,
      targetCadenceMonths: oldCadence === 'custom' ? budget.cadenceCount : null,
      // New columns
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
