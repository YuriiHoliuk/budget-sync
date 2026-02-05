import type { Money } from '../value-objects/index.ts';

export type BudgetType = 'spending' | 'savings' | 'goal' | 'periodic';
export type TargetCadence = 'monthly' | 'yearly' | 'custom';

const VALID_BUDGET_TYPES: readonly BudgetType[] = [
  'spending',
  'savings',
  'goal',
  'periodic',
];
const VALID_CADENCES: readonly TargetCadence[] = [
  'monthly',
  'yearly',
  'custom',
];

/**
 * Type guard to check if a string is a valid BudgetType.
 * Returns true if the value is one of: 'spending', 'savings', 'goal', 'periodic'
 */
export function isBudgetType(value: string): value is BudgetType {
  return VALID_BUDGET_TYPES.includes(value as BudgetType);
}

/**
 * Type guard to check if a string is a valid TargetCadence.
 * Returns true if the value is one of: 'monthly', 'yearly', 'custom'
 */
export function isTargetCadence(value: string): value is TargetCadence {
  return VALID_CADENCES.includes(value as TargetCadence);
}

/**
 * Parse a string to BudgetType, returning a default if invalid.
 * Use this when you need a guaranteed BudgetType value.
 */
export function parseBudgetType(
  value: string | null | undefined,
  defaultValue: BudgetType = 'spending',
): BudgetType {
  if (value && isBudgetType(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Parse a string to TargetCadence, returning null if invalid.
 * Use this when cadence is optional.
 */
export function parseTargetCadence(
  value: string | null | undefined,
): TargetCadence | null {
  if (value && isTargetCadence(value)) {
    return value;
  }
  return null;
}

export interface BudgetProps {
  name: string;
  type: BudgetType;
  amount: Money;
  targetCadence: TargetCadence | null;
  targetCadenceMonths: number | null;
  targetDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  isArchived: boolean;
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

  get type(): BudgetType {
    return this.props.type;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get targetCadence(): TargetCadence | null {
    return this.props.targetCadence;
  }

  get targetCadenceMonths(): number | null {
    return this.props.targetCadenceMonths;
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
