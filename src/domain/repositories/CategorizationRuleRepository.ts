/**
 * CategorizationRuleRepository - Abstract repository for user-defined categorization rules
 *
 * Categorization rules are free-form text instructions that take highest priority
 * when the LLM categorizes transactions.
 */

import type { Rule } from '@domain/entities/Rule.ts';

/**
 * Injection token for CategorizationRuleRepository.
 * Use with @inject(CATEGORIZATION_RULE_REPOSITORY_TOKEN) in classes that depend on this repository.
 */
export const CATEGORIZATION_RULE_REPOSITORY_TOKEN = Symbol(
  'CategorizationRuleRepository',
);

/**
 * Abstract repository for fetching user-defined categorization rules.
 *
 * Rules are stored as free-form text strings that the LLM should follow
 * with highest priority when categorizing transactions.
 */
export abstract class CategorizationRuleRepository {
  /**
   * Find all categorization rules as strings (for LLM consumption).
   */
  abstract findAll(): Promise<string[]>;

  /**
   * Find all categorization rules as Rule entities (for CRUD UI).
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
