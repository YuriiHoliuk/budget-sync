/**
 * BudgetizationRuleRepository - Abstract repository for user-defined budgetization rules
 *
 * Budgetization rules are free-form text instructions that take highest priority
 * when the LLM assigns budgets to transactions.
 */

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
   * Find all budgetization rules.
   *
   * @returns Array of rule strings
   */
  abstract findAll(): Promise<string[]>;
}
