import {
  Budget,
  type BudgetType,
  type TargetCadence,
} from '@domain/entities/Budget.ts';
import { BudgetNameTakenError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateBudgetRequestDTO {
  name: string;
  type: BudgetType;
  currency: string;
  targetAmount: number;
  targetCadence?: TargetCadence | null;
  targetCadenceMonths?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@injectable()
export class CreateBudgetUseCase extends UseCase<
  CreateBudgetRequestDTO,
  Budget
> {
  constructor(
    @inject(BUDGET_REPOSITORY_TOKEN)
    private readonly budgetRepository: BudgetRepository,
  ) {
    super();
  }

  async execute(request: CreateBudgetRequestDTO): Promise<Budget> {
    await this.ensureNameIsAvailable(request.name);

    const budget = this.buildBudget(request);
    return this.budgetRepository.saveAndReturn(budget);
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.budgetRepository.findByName(name);
    if (existing) {
      throw new BudgetNameTakenError(name);
    }
  }

  private buildBudget(request: CreateBudgetRequestDTO): Budget {
    const currency = Currency.fromCode(request.currency);
    const amount = Money.create(request.targetAmount, currency);

    return Budget.create({
      name: request.name,
      type: request.type,
      amount,
      targetCadence: request.targetCadence ?? null,
      targetCadenceMonths: request.targetCadenceMonths ?? null,
      targetDate: request.targetDate ? new Date(request.targetDate) : null,
      startDate: request.startDate ? new Date(request.startDate) : null,
      endDate: request.endDate ? new Date(request.endDate) : null,
      isArchived: false,
    });
  }
}
