import type { CreateAllocationRequestDTO } from '@application/use-cases/CreateAllocation.ts';
import { CreateAllocationUseCase } from '@application/use-cases/CreateAllocation.ts';
import { DeleteAllocationUseCase } from '@application/use-cases/DeleteAllocation.ts';
import type { MoveFundsRequestDTO } from '@application/use-cases/MoveFunds.ts';
import { MoveFundsUseCase } from '@application/use-cases/MoveFunds.ts';
import type { UpdateAllocationRequestDTO } from '@application/use-cases/UpdateAllocation.ts';
import { UpdateAllocationUseCase } from '@application/use-cases/UpdateAllocation.ts';
import type { Allocation } from '@domain/entities/Allocation.ts';
import {
  ALLOCATION_REPOSITORY_TOKEN,
  type AllocationRepository,
} from '@domain/repositories/AllocationRepository.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { inject, injectable } from 'tsyringe';
import {
  type AllocationGql,
  mapAllocationToGql,
  mapBudgetToGql,
  toMinorUnits,
} from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateAllocationInput {
  budgetId: number;
  amount: number;
  currency: string;
  period: string;
  date?: string | null;
  notes?: string | null;
}

interface UpdateAllocationInput {
  id: number;
  budgetId?: number | null;
  amount?: number | null;
  currency?: string | null;
  period?: string | null;
  date?: string | null;
  notes?: string | null;
}

interface MoveFundsInput {
  sourceBudgetId: number;
  destBudgetId: number;
  amount: number;
  currency: string;
  period: string;
  date?: string | null;
  notes?: string | null;
}

@injectable()
export class AllocationsResolver extends Resolver {
  constructor(
    @inject(ALLOCATION_REPOSITORY_TOKEN)
    private allocationRepository: AllocationRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepository: BudgetRepository,
    private createAllocationUseCase: CreateAllocationUseCase,
    private updateAllocationUseCase: UpdateAllocationUseCase,
    private deleteAllocationUseCase: DeleteAllocationUseCase,
    private moveFundsUseCase: MoveFundsUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        allocations: (
          _parent: unknown,
          args: { budgetId?: number; period?: string },
        ) => this.getAllocations(args),
        allocation: (_parent: unknown, args: { id: number }) =>
          this.getAllocationById(args.id),
      },
      Mutation: {
        createAllocation: (
          _parent: unknown,
          args: { input: CreateAllocationInput },
        ) => this.createAllocation(args.input),
        updateAllocation: (
          _parent: unknown,
          args: { input: UpdateAllocationInput },
        ) => this.updateAllocation(args.input),
        deleteAllocation: (_parent: unknown, args: { id: number }) =>
          this.deleteAllocation(args.id),
        moveFunds: (_parent: unknown, args: { input: MoveFundsInput }) =>
          this.moveFunds(args.input),
      },
      Allocation: {
        budget: (parent: AllocationGql) =>
          this.getAllocationBudget(parent.budgetId),
      },
    };
  }

  private async getAllocations(args: { budgetId?: number; period?: string }) {
    const allocations = await this.resolveAllocations(args);
    return allocations.map(mapAllocationToGql);
  }

  private async getAllocationById(id: number) {
    const allocation = await this.allocationRepository.findById(id);
    return allocation ? mapAllocationToGql(allocation) : null;
  }

  private async createAllocation(input: CreateAllocationInput) {
    const allocation = await this.createAllocationUseCase.execute(
      this.mapCreateInput(input),
    );
    return mapAllocationToGql(allocation);
  }

  private async updateAllocation(input: UpdateAllocationInput) {
    const allocation = await this.updateAllocationUseCase.execute(
      this.mapUpdateInput(input),
    );
    return mapAllocationToGql(allocation);
  }

  private async deleteAllocation(id: number) {
    await this.deleteAllocationUseCase.execute({ id });
    return true;
  }

  private async moveFunds(input: MoveFundsInput) {
    const result = await this.moveFundsUseCase.execute(
      this.mapMoveFundsInput(input),
    );
    return {
      sourceAllocation: mapAllocationToGql(result.sourceAllocation),
      destAllocation: mapAllocationToGql(result.destAllocation),
    };
  }

  private async getAllocationBudget(budgetId: number) {
    const budget = await this.budgetRepository.findById(budgetId);
    return budget ? mapBudgetToGql(budget) : null;
  }

  private resolveAllocations(args: {
    budgetId?: number;
    period?: string;
  }): Promise<Allocation[]> {
    if (args.budgetId !== undefined && args.period !== undefined) {
      return this.allocationRepository.findByBudgetAndPeriod(
        args.budgetId,
        args.period,
      );
    }
    if (args.budgetId !== undefined) {
      return this.allocationRepository.findByBudgetId(args.budgetId);
    }
    if (args.period !== undefined) {
      return this.allocationRepository.findByPeriod(args.period);
    }
    return this.allocationRepository.findAll();
  }

  private mapCreateInput(
    input: CreateAllocationInput,
  ): CreateAllocationRequestDTO {
    return {
      budgetId: input.budgetId,
      amount: toMinorUnits(input.amount),
      currency: input.currency,
      period: input.period,
      date: input.date ?? undefined,
      notes: input.notes ?? null,
    };
  }

  private mapUpdateInput(
    input: UpdateAllocationInput,
  ): UpdateAllocationRequestDTO {
    return {
      id: input.id,
      budgetId: input.budgetId ?? undefined,
      amount: input.amount != null ? toMinorUnits(input.amount) : undefined,
      currency: input.currency ?? undefined,
      period: input.period ?? undefined,
      date: input.date ?? undefined,
      notes: input.notes !== undefined ? input.notes : undefined,
    };
  }

  private mapMoveFundsInput(input: MoveFundsInput): MoveFundsRequestDTO {
    return {
      sourceBudgetId: input.sourceBudgetId,
      destBudgetId: input.destBudgetId,
      amount: toMinorUnits(input.amount),
      currency: input.currency,
      period: input.period,
      date: input.date ?? undefined,
      notes: input.notes ?? null,
    };
  }
}
