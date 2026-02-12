import type { BudgetGroup } from '../entities/BudgetGroup.ts';

/**
 * Injection token for BudgetGroupRepository.
 * Use with @inject(BUDGET_GROUP_REPOSITORY_TOKEN) in classes that depend on BudgetGroupRepository.
 */
export const BUDGET_GROUP_REPOSITORY_TOKEN = Symbol('BudgetGroupRepository');

/**
 * Budget group repository for managing budget group entities.
 */
export abstract class BudgetGroupRepository {
  abstract findAll(): Promise<BudgetGroup[]>;
  abstract findById(id: number): Promise<BudgetGroup | null>;
  abstract save(group: BudgetGroup): Promise<BudgetGroup>;
  abstract update(group: BudgetGroup): Promise<BudgetGroup>;
  abstract delete(id: number): Promise<void>;
}
