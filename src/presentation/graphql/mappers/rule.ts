import type { Rule } from '@domain/entities/Rule.ts';

export interface RuleGql {
  id: number;
  rule: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export function mapRuleToGql(rule: Rule): RuleGql {
  return {
    id: rule.id,
    rule: rule.rule,
    priority: rule.priority,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
