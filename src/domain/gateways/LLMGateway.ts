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
 * Category information including hierarchy path.
 */
export interface CategoryInfo {
  name: string;
  /** Full path in "Parent > Child" format for hierarchy */
  fullPath: string;
}

/**
 * Request payload for transaction categorization.
 */
export interface CategorizationRequest {
  transaction: TransactionContext;
  availableCategories: CategoryInfo[];
  availableBudgets: string[];
  customRules?: string[];
}

/**
 * Result of LLM categorization.
 */
export interface CategorizationResult {
  category: string | null;
  categoryReason: string | null;
  budget: string | null;
  budgetReason: string | null;
  /** True if category is not in availableCategories (LLM suggested new one) */
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
   * Categorize a transaction using LLM.
   *
   * @param request - Transaction context and available categories/budgets
   * @returns Categorization result with category, budget, and reasoning
   */
  abstract categorize(
    request: CategorizationRequest,
  ): Promise<CategorizationResult>;
}
