/**
 * Context information about a transaction for LLM categorization.
 */
export interface TransactionContext {
  description: string;
  amount: number;
  currency: string;
  date: Date;
  counterpartyName?: string;
  mcc?: number;
  bankCategory?: string;
}

/**
 * Category information including hierarchy.
 */
export interface CategoryInfo {
  name: string;
  /** Parent category name (if any) */
  parent?: string;
}

/**
 * Request payload for category assignment.
 */
export interface CategoryAssignmentRequest {
  transaction: TransactionContext;
  availableCategories: CategoryInfo[];
  categoryRules?: string[];
}

/**
 * Result of LLM category assignment.
 */
export interface CategoryAssignmentResult {
  category: string | null;
  categoryReason: string | null;
  /** True if category is not in availableCategories (LLM suggested new one) */
  isNewCategory: boolean;
}

/**
 * Request payload for budget assignment.
 */
export interface BudgetAssignmentRequest {
  transaction: TransactionContext;
  availableBudgets: string[];
  budgetRules?: string[];
  /** The category already assigned to this transaction */
  assignedCategory: string | null;
}

/**
 * Result of LLM budget assignment.
 */
export interface BudgetAssignmentResult {
  budget: string | null;
  budgetReason: string | null;
}

/**
 * Combined result of category and budget assignment.
 * Used by the use case to aggregate results from both LLM calls.
 */
export interface CategorizationResult {
  category: string | null;
  categoryReason: string | null;
  budget: string | null;
  budgetReason: string | null;
  isNewCategory: boolean;
}

/**
 * Injection token for LLMGateway.
 * Use with @inject(LLM_GATEWAY_TOKEN) in classes that depend on LLMGateway.
 */
export const LLM_GATEWAY_TOKEN = Symbol('LLMGateway');

/**
 * Abstract gateway for LLM-based operations.
 * Implementations wrap specific LLM providers (e.g., Gemini).
 */
export abstract class LLMGateway {
  /**
   * Assign a category to a transaction using LLM.
   *
   * @param request - Transaction context and available categories
   * @returns Category assignment result with category and reasoning
   */
  abstract assignCategory(
    request: CategoryAssignmentRequest,
  ): Promise<CategoryAssignmentResult>;

  /**
   * Assign a budget to a transaction using LLM.
   *
   * @param request - Transaction context, available budgets, and assigned category
   * @returns Budget assignment result with budget and reasoning
   */
  abstract assignBudget(
    request: BudgetAssignmentRequest,
  ): Promise<BudgetAssignmentResult>;
}
