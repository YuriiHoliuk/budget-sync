import type { Money } from '../value-objects/index.ts';

export type BudgetType = 'spending' | 'savings' | 'goal' | 'periodic';
export type TargetCadence = 'monthly' | 'yearly' | 'custom';

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
}
