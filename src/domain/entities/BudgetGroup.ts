export interface BudgetGroupProps {
  name: string;
  sortOrder: string | null;
  dbId?: number | null;
}

export class BudgetGroup {
  private constructor(
    public readonly id: string,
    private readonly props: BudgetGroupProps,
  ) {}

  static create(props: BudgetGroupProps, id?: string): BudgetGroup {
    return new BudgetGroup(id ?? props.name, props);
  }

  get name(): string {
    return this.props.name;
  }

  get sortOrder(): string | null {
    return this.props.sortOrder;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  withDbId(dbId: number): BudgetGroup {
    return BudgetGroup.create({ ...this.props, dbId }, this.id);
  }

  withUpdatedProps(updates: Partial<BudgetGroupProps>): BudgetGroup {
    return BudgetGroup.create({ ...this.props, ...updates }, this.id);
  }
}
