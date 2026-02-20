/**
 * BudgetizationRuleRepository - Abstract repository for user-defined budgetization rules
 *
 * Budgetization rules are free-form text instructions that take highest priority
 * when the LLM assigns budgets to transactions.
 */

import type { Rule } from '@domain/entities/Rule.ts';

/**
 * Injection token for BudgetizationRuleRepository.
 * Use with @inject(BUDGETIZATION_RULE_REPOSITORY_TOKEN) in classes that depend on this repository.
 */
export const BUDGETIZATION_RULE_REPOSITORY_TOKEN = Symbol(
  'BudgetizationRuleRepository',
);

/**
 * Abstract repository for fetching user-defined budgetization rules.
 *
 * Rules are stored as free-form text strings that the LLM should follow
 * with highest priority when assigning budgets to transactions.
 */
export abstract class BudgetizationRuleRepository {
  /**
   * Find all budgetization rules as strings (for LLM consumption).
   */
  abstract findAll(): Promise<string[]>;

  /**
   * Find all budgetization rules as Rule entities (for CRUD UI).
   */
  abstract findAllRules(): Promise<Rule[]>;

  /**
   * Find a single rule by its database ID.
   */
  abstract findById(id: number): Promise<Rule | null>;

  /**
   * Create a new rule and return the created entity.
   */
  abstract save(rule: Rule): Promise<Rule>;

  /**
   * Update an existing rule and return the updated entity.
   */
  abstract update(rule: Rule): Promise<Rule>;

  /**
   * Delete a rule by its database ID.
   */
  abstract delete(id: number): Promise<void>;
}
