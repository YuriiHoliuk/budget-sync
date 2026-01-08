import type { Budget } from '../entities/Budget.ts';

/**
 * Injection token for BudgetRepository.
 * Use with @inject(BUDGET_REPOSITORY_TOKEN) in classes that depend on BudgetRepository.
 */
export const BUDGET_REPOSITORY_TOKEN = Symbol('BudgetRepository');

/**
 * Budget repository for managing budget entities.
 * Provides methods to query budgets.
 */
export abstract class BudgetRepository {
  abstract findAll(): Promise<Budget[]>;
  abstract findByName(name: string): Promise<Budget | null>;
  abstract findActive(date: Date): Promise<Budget[]>;
}
