export interface RuleProps {
  rule: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  dbId?: number | null;
}

export class Rule {
  private constructor(private readonly props: RuleProps) {}

  static create(props: RuleProps): Rule {
    if (!props.rule.trim()) {
      throw new Error('Rule text cannot be empty');
    }
    return new Rule(props);
  }

  get id(): number {
    return this.props.dbId ?? 0;
  }

  get rule(): string {
    return this.props.rule;
  }

  get priority(): number {
    return this.props.priority;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get dbId(): number | null {
    return this.props.dbId ?? null;
  }

  withDbId(dbId: number): Rule {
    return Rule.create({ ...this.props, dbId });
  }

  withUpdatedProps(updates: { rule?: string; priority?: number }): Rule {
    return Rule.create({
      ...this.props,
      rule: updates.rule ?? this.props.rule,
      priority: updates.priority ?? this.props.priority,
      updatedAt: new Date(),
    });
  }
}
