import type {
  accounts,
  allocations,
  budgetizationRules,
  budgets,
  categories,
  categorizationRules,
  exchangeRates,
  transactions,
} from './schema/index.ts';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

export type BudgetRow = typeof budgets.$inferSelect;
export type NewBudgetRow = typeof budgets.$inferInsert;

export type AllocationRow = typeof allocations.$inferSelect;
export type NewAllocationRow = typeof allocations.$inferInsert;

export type CategorizationRuleRow = typeof categorizationRules.$inferSelect;
export type NewCategorizationRuleRow = typeof categorizationRules.$inferInsert;

export type BudgetizationRuleRow = typeof budgetizationRules.$inferSelect;
export type NewBudgetizationRuleRow = typeof budgetizationRules.$inferInsert;

export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
export type NewExchangeRateRow = typeof exchangeRates.$inferInsert;
