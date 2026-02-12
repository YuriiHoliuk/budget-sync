import type { CreateBudgetGroupRequestDTO } from '@application/use-cases/CreateBudgetGroup.ts';
import { CreateBudgetGroupUseCase } from '@application/use-cases/CreateBudgetGroup.ts';
import type { DeleteBudgetGroupRequestDTO } from '@application/use-cases/DeleteBudgetGroup.ts';
import { DeleteBudgetGroupUseCase } from '@application/use-cases/DeleteBudgetGroup.ts';
import type { ReorderBudgetGroupRequestDTO } from '@application/use-cases/ReorderBudgetGroup.ts';
import { ReorderBudgetGroupUseCase } from '@application/use-cases/ReorderBudgetGroup.ts';
import type { UpdateBudgetGroupRequestDTO } from '@application/use-cases/UpdateBudgetGroup.ts';
import { UpdateBudgetGroupUseCase } from '@application/use-cases/UpdateBudgetGroup.ts';
import {
  BUDGET_GROUP_REPOSITORY_TOKEN,
  type BudgetGroupRepository,
} from '@domain/repositories/BudgetGroupRepository.ts';
import { inject, injectable } from 'tsyringe';
import { mapBudgetGroupToGql } from '../mappers/index.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface ReorderBudgetGroupInput {
  groupId: number;
  afterGroupId?: number | null;
  beforeGroupId?: number | null;
}

@injectable()
export class BudgetGroupsResolver extends Resolver {
  constructor(
    @inject(BUDGET_GROUP_REPOSITORY_TOKEN)
    private budgetGroupRepository: BudgetGroupRepository,
    private createBudgetGroupUseCase: CreateBudgetGroupUseCase,
    private updateBudgetGroupUseCase: UpdateBudgetGroupUseCase,
    private deleteBudgetGroupUseCase: DeleteBudgetGroupUseCase,
    private reorderBudgetGroupUseCase: ReorderBudgetGroupUseCase,
  ) {
    super();
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        budgetGroups: () => this.getBudgetGroups(),
      },
      Mutation: {
        createBudgetGroup: (_parent: unknown, args: { name: string }) =>
          this.createBudgetGroup(args.name),
        updateBudgetGroup: (
          _parent: unknown,
          args: { id: number; name: string },
        ) => this.updateBudgetGroup(args.id, args.name),
        deleteBudgetGroup: (_parent: unknown, args: { id: number }) =>
          this.deleteBudgetGroup(args.id),
        reorderBudgetGroup: (
          _parent: unknown,
          args: { input: ReorderBudgetGroupInput },
        ) => this.reorderBudgetGroup(args.input),
      },
    };
  }

  private async getBudgetGroups() {
    const groups = await this.budgetGroupRepository.findAll();
    return groups.map(mapBudgetGroupToGql);
  }

  private async createBudgetGroup(name: string) {
    const request: CreateBudgetGroupRequestDTO = { name };
    const group = await this.createBudgetGroupUseCase.execute(request);
    return mapBudgetGroupToGql(group);
  }

  private async updateBudgetGroup(id: number, name: string) {
    const request: UpdateBudgetGroupRequestDTO = { id, name };
    const group = await this.updateBudgetGroupUseCase.execute(request);
    return mapBudgetGroupToGql(group);
  }

  private async deleteBudgetGroup(id: number) {
    const request: DeleteBudgetGroupRequestDTO = { id };
    return await this.deleteBudgetGroupUseCase.execute(request);
  }

  private async reorderBudgetGroup(input: ReorderBudgetGroupInput) {
    const request: ReorderBudgetGroupRequestDTO = {
      groupId: input.groupId,
      afterGroupId: input.afterGroupId ?? null,
      beforeGroupId: input.beforeGroupId ?? null,
    };
    const group = await this.reorderBudgetGroupUseCase.execute(request);
    return mapBudgetGroupToGql(group);
  }
}
