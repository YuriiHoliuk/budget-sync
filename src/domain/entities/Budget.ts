import type { Money } from '../value-objects/index.ts';

export interface BudgetProps {
  name: string;
  amount: Money;
  startDate: Date;
  endDate: Date;
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

  get startDate(): Date {
    return this.props.startDate;
  }

  get endDate(): Date {
    return this.props.endDate;
  }

  /** Returns true if the budget is active on the given date */
  isActiveOn(date: Date): boolean {
    return date >= this.props.startDate && date <= this.props.endDate;
  }
}
