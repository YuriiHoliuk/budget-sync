import {
  type CreateRuleRequestDTO,
  CreateRuleUseCase,
} from '@application/use-cases/CreateRule.ts';
import { DeleteRuleUseCase } from '@application/use-cases/DeleteRule.ts';
import {
  type UpdateRuleRequestDTO,
  UpdateRuleUseCase,
} from '@application/use-cases/UpdateRule.ts';
import {
  BUDGETIZATION_RULE_REPOSITORY_TOKEN,
  type BudgetizationRuleRepository,
} from '@domain/repositories/BudgetizationRuleRepository.ts';
import {
  CATEGORIZATION_RULE_REPOSITORY_TOKEN,
  type CategorizationRuleRepository,
} from '@domain/repositories/CategorizationRuleRepository.ts';
import { inject, injectable } from 'tsyringe';
import { mapRuleToGql, type RuleGql } from '../mappers/rule.ts';
import { Resolver, type ResolverMap } from '../Resolver.ts';

interface CreateRuleInput {
  rule: string;
  priority?: number | null;
}

interface UpdateRuleInput {
  id: number;
  rule?: string | null;
  priority?: number | null;
}

@injectable()
export class RulesResolver extends Resolver {
  private readonly createCategorizationRule: CreateRuleUseCase;
  private readonly updateCategorizationRule: UpdateRuleUseCase;
  private readonly deleteCategorizationRule: DeleteRuleUseCase;
  private readonly createBudgetizationRule: CreateRuleUseCase;
  private readonly updateBudgetizationRule: UpdateRuleUseCase;
  private readonly deleteBudgetizationRule: DeleteRuleUseCase;

  constructor(
    @inject(CATEGORIZATION_RULE_REPOSITORY_TOKEN)
    private readonly categorizationRuleRepository: CategorizationRuleRepository,
    @inject(BUDGETIZATION_RULE_REPOSITORY_TOKEN)
    private readonly budgetizationRuleRepository: BudgetizationRuleRepository,
  ) {
    super();
    this.createCategorizationRule = new CreateRuleUseCase(
      this.categorizationRuleRepository,
    );
    this.updateCategorizationRule = new UpdateRuleUseCase(
      this.categorizationRuleRepository,
    );
    this.deleteCategorizationRule = new DeleteRuleUseCase(
      this.categorizationRuleRepository,
    );
    this.createBudgetizationRule = new CreateRuleUseCase(
      this.budgetizationRuleRepository,
    );
    this.updateBudgetizationRule = new UpdateRuleUseCase(
      this.budgetizationRuleRepository,
    );
    this.deleteBudgetizationRule = new DeleteRuleUseCase(
      this.budgetizationRuleRepository,
    );
  }

  getResolverMap(): ResolverMap {
    return {
      Query: {
        categorizationRules: () => this.getCategorizationRules(),
        budgetizationRules: () => this.getBudgetizationRules(),
      },
      Mutation: {
        createCategorizationRule: (
          _parent: unknown,
          args: { input: CreateRuleInput },
        ) => this.handleCreateCategorizationRule(args.input),
        updateCategorizationRule: (
          _parent: unknown,
          args: { input: UpdateRuleInput },
        ) => this.handleUpdateCategorizationRule(args.input),
        deleteCategorizationRule: (_parent: unknown, args: { id: number }) =>
          this.handleDeleteCategorizationRule(args.id),
        createBudgetizationRule: (
          _parent: unknown,
          args: { input: CreateRuleInput },
        ) => this.handleCreateBudgetizationRule(args.input),
        updateBudgetizationRule: (
          _parent: unknown,
          args: { input: UpdateRuleInput },
        ) => this.handleUpdateBudgetizationRule(args.input),
        deleteBudgetizationRule: (_parent: unknown, args: { id: number }) =>
          this.handleDeleteBudgetizationRule(args.id),
      },
    };
  }

  private async getCategorizationRules(): Promise<RuleGql[]> {
    const rules = await this.categorizationRuleRepository.findAllRules();
    return rules.map(mapRuleToGql);
  }

  private async getBudgetizationRules(): Promise<RuleGql[]> {
    const rules = await this.budgetizationRuleRepository.findAllRules();
    return rules.map(mapRuleToGql);
  }

  private async handleCreateCategorizationRule(
    input: CreateRuleInput,
  ): Promise<RuleGql> {
    const rule = await this.createCategorizationRule.execute(
      this.mapCreateInput(input),
    );
    return mapRuleToGql(rule);
  }

  private async handleUpdateCategorizationRule(
    input: UpdateRuleInput,
  ): Promise<RuleGql> {
    const rule = await this.updateCategorizationRule.execute(
      this.mapUpdateInput(input),
    );
    return mapRuleToGql(rule);
  }

  private async handleDeleteCategorizationRule(id: number): Promise<boolean> {
    await this.deleteCategorizationRule.execute({ id });
    return true;
  }

  private async handleCreateBudgetizationRule(
    input: CreateRuleInput,
  ): Promise<RuleGql> {
    const rule = await this.createBudgetizationRule.execute(
      this.mapCreateInput(input),
    );
    return mapRuleToGql(rule);
  }

  private async handleUpdateBudgetizationRule(
    input: UpdateRuleInput,
  ): Promise<RuleGql> {
    const rule = await this.updateBudgetizationRule.execute(
      this.mapUpdateInput(input),
    );
    return mapRuleToGql(rule);
  }

  private async handleDeleteBudgetizationRule(id: number): Promise<boolean> {
    await this.deleteBudgetizationRule.execute({ id });
    return true;
  }

  private mapCreateInput(input: CreateRuleInput): CreateRuleRequestDTO {
    return {
      rule: input.rule,
      priority: input.priority ?? undefined,
    };
  }

  private mapUpdateInput(input: UpdateRuleInput): UpdateRuleRequestDTO {
    return {
      id: input.id,
      rule: input.rule ?? undefined,
      priority: input.priority ?? undefined,
    };
  }
}
