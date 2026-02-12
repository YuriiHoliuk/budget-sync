import type { Money } from '../value-objects/index.ts';

export interface BudgetTargetProps {
  budgetId: number;
  targetAmount: Money;
  effectiveFrom: string;
  dbId?: number | null;
}

export class BudgetTarget {
  private constructor(
    public readonly id: string,
    private readonly props: BudgetTargetProps,
  ) {}

  static create(props: BudgetTargetProps, id?: string): BudgetTarget {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(props.effectiveFrom)) {
      throw new Error(
        `Invalid effectiveFrom format: "${props.effectiveFrom}". Expected YYYY-MM.`,
      );
    }
    return new BudgetTarget(
      id ?? `${props.budgetId}-${props.effectiveFrom}`,
      props,
    );
  }

  get budgetId(): number {
    return this.props.budgetId;
  }

  get targetAmount(): Money {
    return this.props.targetAmount;
  }

  get effectiveFrom(): string {
    return this.props.effectiveFrom;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  withDbId(dbId: number): BudgetTarget {
    return BudgetTarget.create({ ...this.props, dbId }, this.id);
  }
}
