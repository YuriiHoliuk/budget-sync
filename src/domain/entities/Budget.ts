import type { Money } from '../value-objects/index.ts';

export type CadenceUnit = 'day' | 'week' | 'month' | 'year';

const VALID_CADENCE_UNITS: readonly CadenceUnit[] = [
  'day',
  'week',
  'month',
  'year',
];

/**
 * Type guard to check if a string is a valid CadenceUnit.
 * Returns true if the value is one of: 'day', 'week', 'month', 'year'
 */
export function isCadenceUnit(value: string): value is CadenceUnit {
  return VALID_CADENCE_UNITS.includes(value as CadenceUnit);
}

/**
 * Parse a string to CadenceUnit, returning null if invalid.
 * Use this when cadence unit is optional.
 */
export function parseCadenceUnit(
  value: string | null | undefined,
): CadenceUnit | null {
  if (value && isCadenceUnit(value)) {
    return value;
  }
  return null;
}

export interface BudgetProps {
  name: string;
  amount: Money;
  cadenceUnit: CadenceUnit | null;
  cadenceCount: number | null;
  targetDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  isArchived: boolean;
  cap: Money | null;
  sortOrder: string | null;
  budgetGroupId: number | null;
  dbId?: number | null;
}

export class Budget {
  private constructor(
    public readonly id: string,
    private readonly props: BudgetProps,
  ) {}

  static create(props: BudgetProps, id?: string): Budget {
    return new Budget(id ?? props.name, props);
  }

  get name(): string {
    return this.props.name;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get cadenceUnit(): CadenceUnit | null {
    return this.props.cadenceUnit;
  }

  get cadenceCount(): number | null {
    return this.props.cadenceCount;
  }

  get targetDate(): Date | null {
    return this.props.targetDate;
  }

  get startDate(): Date | null {
    return this.props.startDate;
  }

  get endDate(): Date | null {
    return this.props.endDate;
  }

  get isArchived(): boolean {
    return this.props.isArchived;
  }

  get cap(): Money | null {
    return this.props.cap;
  }

  get sortOrder(): string | null {
    return this.props.sortOrder;
  }

  get budgetGroupId(): number | null {
    return this.props.budgetGroupId;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  /** Returns true if the budget is active on the given date */
  isActiveOn(date: Date): boolean {
    const afterStart = !this.props.startDate || date >= this.props.startDate;
    const beforeEnd = !this.props.endDate || date <= this.props.endDate;
    return !this.props.isArchived && afterStart && beforeEnd;
  }

  withDbId(dbId: number): Budget {
    return Budget.create({ ...this.props, dbId }, this.id);
  }

  /** Returns a new Budget with the given properties overridden */
  withUpdatedProps(updates: Partial<BudgetProps>): Budget {
    return Budget.create({ ...this.props, ...updates }, this.id);
  }

  /** Returns a new Budget with isArchived set to true */
  archive(): Budget {
    return Budget.create({ ...this.props, isArchived: true }, this.id);
  }
}
