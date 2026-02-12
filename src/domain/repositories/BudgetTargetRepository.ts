import type { BudgetTarget } from '../entities/BudgetTarget.ts';

export const BUDGET_TARGET_REPOSITORY_TOKEN = Symbol('BudgetTargetRepository');

export abstract class BudgetTargetRepository {
  abstract findByBudgetId(budgetId: number): Promise<BudgetTarget[]>;
  abstract findAllForBudgets(budgetIds: number[]): Promise<BudgetTarget[]>;
  abstract findActiveTarget(
    budgetId: number,
    month: string,
  ): Promise<BudgetTarget | null>;
  abstract save(target: BudgetTarget): Promise<BudgetTarget>;
}
