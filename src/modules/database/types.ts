import type {
  accounts,
  allocations,
  bankTransactionReturns,
  bankTransactions,
  budgetGroups,
  budgetizationRules,
  budgets,
  budgetTargets,
  categories,
  categorizationRules,
  exchangeRates,
  transactionSources,
  transactions,
  transferPairs,
} from './schema/index.ts';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeout?: number;
  connectTimeout?: number;
}

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

export type BankTransactionReturnRow =
  typeof bankTransactionReturns.$inferSelect;
export type NewBankTransactionReturnRow =
  typeof bankTransactionReturns.$inferInsert;

export type BankTransactionRow = typeof bankTransactions.$inferSelect;
export type NewBankTransactionRow = typeof bankTransactions.$inferInsert;

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

export type TransactionSourceRow = typeof transactionSources.$inferSelect;
export type NewTransactionSourceRow = typeof transactionSources.$inferInsert;

export type TransferPairRow = typeof transferPairs.$inferSelect;
export type NewTransferPairRow = typeof transferPairs.$inferInsert;

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

export type BudgetRow = typeof budgets.$inferSelect;
export type NewBudgetRow = typeof budgets.$inferInsert;

export type BudgetGroupRow = typeof budgetGroups.$inferSelect;
export type NewBudgetGroupRow = typeof budgetGroups.$inferInsert;

export type BudgetTargetRow = typeof budgetTargets.$inferSelect;
export type NewBudgetTargetRow = typeof budgetTargets.$inferInsert;

export type AllocationRow = typeof allocations.$inferSelect;
export type NewAllocationRow = typeof allocations.$inferInsert;

export type CategorizationRuleRow = typeof categorizationRules.$inferSelect;
export type NewCategorizationRuleRow = typeof categorizationRules.$inferInsert;

export type BudgetizationRuleRow = typeof budgetizationRules.$inferSelect;
export type NewBudgetizationRuleRow = typeof budgetizationRules.$inferInsert;

export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
export type NewExchangeRateRow = typeof exchangeRates.$inferInsert;
