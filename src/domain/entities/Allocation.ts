import { Money } from '@domain/value-objects/Money.ts';

export interface AllocationProps {
  budgetId: number;
  amount: Money;
  period: string; // YYYY-MM format
  date: Date;
  notes: string | null;
  dbId?: number | null;
}

/**
 * Represents a money allocation to a budget envelope for a specific month.
 *
 * Allocations are the mechanism by which users assign money from "Ready to Assign"
 * into budget envelopes. Multiple allocations can target the same budget/period
 * (they sum up). Negative allocations remove money from a budget.
 */
export class Allocation {
  private constructor(private readonly props: AllocationProps) {}

  static create(props: AllocationProps): Allocation {
    Allocation.validatePeriod(props.period);
    return new Allocation(props);
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  get budgetId(): number {
    return this.props.budgetId;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get period(): string {
    return this.props.period;
  }

  get date(): Date {
    return this.props.date;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  withDbId(dbId: number): Allocation {
    return Allocation.create({ ...this.props, dbId });
  }

  withUpdatedProps(updates: Partial<AllocationProps>): Allocation {
    return Allocation.create({ ...this.props, ...updates });
  }

  private static validatePeriod(period: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error(`Invalid period format: "${period}". Expected YYYY-MM.`);
    }
  }
}
