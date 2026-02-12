import { Budget, type CadenceUnit } from '@domain/entities/Budget.ts';
import { BudgetNameTakenError } from '@domain/errors/DomainErrors.ts';
import {
  BUDGET_REPOSITORY_TOKEN,
  type BudgetRepository,
} from '@domain/repositories/BudgetRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { generateOrderKey } from '@modules/ordering/index.ts';
import { inject, injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

export interface CreateBudgetRequestDTO {
  name: string;
  currency: string;
  targetAmount: number;
  cadenceUnit?: CadenceUnit | null;
  cadenceCount?: number | null;
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cap?: number | null;
  budgetGroupId?: number | null;
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

    const sortOrder = await this.generateNextSortOrder();
    const budget = this.buildBudget(request, sortOrder);
    return this.budgetRepository.saveAndReturn(budget);
  }

  private async ensureNameIsAvailable(name: string): Promise<void> {
    const existing = await this.budgetRepository.findByName(name);
    if (existing) {
      throw new BudgetNameTakenError(name);
    }
  }

  private async generateNextSortOrder(): Promise<string> {
    const allBudgets = await this.budgetRepository.findAll();
    const lastSortOrder =
      allBudgets.length > 0
        ? (allBudgets[allBudgets.length - 1]?.sortOrder ?? null)
        : null;
    return generateOrderKey(lastSortOrder, null);
  }

  private buildBudget(
    request: CreateBudgetRequestDTO,
    sortOrder: string,
  ): Budget {
    const currency = Currency.fromCode(request.currency);
    const amount = Money.create(request.targetAmount, currency);

    const cap =
      request.cap != null ? Money.create(request.cap, currency) : null;

    return Budget.create({
      name: request.name,
      amount,
      cadenceUnit: request.cadenceUnit ?? null,
      cadenceCount: request.cadenceCount ?? null,
      targetDate: request.targetDate ? new Date(request.targetDate) : null,
      startDate: request.startDate ? new Date(request.startDate) : null,
      endDate: request.endDate ? new Date(request.endDate) : null,
      isArchived: false,
      cap,
      sortOrder,
      budgetGroupId: request.budgetGroupId ?? null,
    });
  }
}
