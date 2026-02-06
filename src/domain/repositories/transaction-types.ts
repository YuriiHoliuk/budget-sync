/**
 * Domain-level types for transaction queries.
 * These types define the contract between domain and infrastructure layers
 * for transaction-related operations that need more than the Transaction entity.
 */

/**
 * A complete transaction record including categorization data.
 * Used when GraphQL needs full transaction details including category/budget assignments.
 * This is separate from the Transaction entity because categorization is a concern
 * that spans across the application layer (not pure domain logic).
 */
export interface TransactionRecord {
  id: number;
  externalId: string | null;
  date: Date;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  accountId: number | null;
  accountExternalId: string | null;
  categoryId: number | null;
  budgetId: number | null;
  categorizationStatus: string | null;
  categoryReason: string | null;
  budgetReason: string | null;
  mcc: number | null;
  bankDescription: string | null;
  counterparty: string | null;
  counterpartyIban: string | null;
  hold: boolean | null;
  cashback: number | null;
  commission: number | null;
  receiptId: string | null;
  notes: string | null;
}

/**
 * Filter parameters for querying transactions.
 */
export interface TransactionFilterParams {
  accountId?: number;
  categoryId?: number;
  budgetId?: number;
  /** If true, filter for transactions with no budget assigned */
  unbudgetedOnly?: boolean;
  /** Filter by account role (operational or savings) */
  accountRole?: 'operational' | 'savings';
  type?: string;
  categorizationStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/**
 * Pagination parameters for list queries.
 */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Lightweight transaction summary data for budget calculations.
 * Used by BudgetCalculationService to compute monthly overview metrics.
 */
export interface TransactionSummary {
  budgetId: number | null;
  amount: number;
  type: 'credit' | 'debit';
  date: Date;
  accountRole: 'operational' | 'savings';
}
