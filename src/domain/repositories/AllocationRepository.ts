import type { Allocation } from '@domain/entities/Allocation.ts';

export const ALLOCATION_REPOSITORY_TOKEN = Symbol('AllocationRepository');

/**
 * Repository interface for Allocation entities.
 *
 * Provides access to budget allocation records used in the envelope budgeting system.
 */
export abstract class AllocationRepository {
  abstract findAll(): Promise<Allocation[]>;
  abstract findById(id: number): Promise<Allocation | null>;
  abstract findByBudgetId(budgetId: number): Promise<Allocation[]>;
  abstract findByPeriod(period: string): Promise<Allocation[]>;
  abstract findByBudgetAndPeriod(
    budgetId: number,
    period: string,
  ): Promise<Allocation[]>;
  abstract save(allocation: Allocation): Promise<Allocation>;
  abstract update(allocation: Allocation): Promise<Allocation>;
  abstract delete(id: number): Promise<void>;
}
