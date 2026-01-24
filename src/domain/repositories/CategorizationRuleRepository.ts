/**
 * CategorizationRuleRepository - Abstract repository for user-defined categorization rules
 *
 * Categorization rules are free-form text instructions that take highest priority
 * when the LLM categorizes transactions.
 */

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
   * Find all categorization rules.
   *
   * @returns Array of rule strings
   */
  abstract findAll(): Promise<string[]>;
}
