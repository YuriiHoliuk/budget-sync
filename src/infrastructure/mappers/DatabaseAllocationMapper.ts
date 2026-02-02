import { Allocation } from '@domain/entities/Allocation.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import type {
  AllocationRow,
  NewAllocationRow,
} from '@modules/database/types.ts';

/**
 * Maps between database allocation rows and domain Allocation entities.
 *
 * Amount is stored in minor units (kopecks) in the database.
 * Period is stored as YYYY-MM varchar.
 * Date is stored as a date string (YYYY-MM-DD).
 */
export class DatabaseAllocationMapper {
  toEntity(row: AllocationRow): Allocation {
    const currency = Currency.UAH;
    const amount = Money.create(row.amount, currency);

    return Allocation.create({
      budgetId: row.budgetId,
      amount,
      period: row.period,
      date: new Date(row.date),
      notes: row.notes ?? null,
      dbId: row.id,
    });
  }

  toInsert(allocation: Allocation): NewAllocationRow {
    return {
      budgetId: allocation.budgetId,
      amount: allocation.amount.amount,
      period: allocation.period,
      date: this.formatDate(allocation.date),
      notes: allocation.notes,
    };
  }

  private formatDate(date: Date): string {
    const [dateStr] = date.toISOString().split('T');
    return dateStr ?? date.toISOString().slice(0, 10);
  }
}
