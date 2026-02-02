import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  type CreateBudgetRequestDTO,
  CreateBudgetUseCase,
} from '@application/use-cases/CreateBudget.ts';
import { BudgetNameTakenError } from '@domain/errors/DomainErrors.ts';
import type { BudgetRepository } from '@domain/repositories/BudgetRepository.ts';
import { createMockBudgetRepository, createTestBudget } from '../../helpers';

describe('CreateBudgetUseCase', () => {
  let mockBudgetRepository: BudgetRepository;
  let useCase: CreateBudgetUseCase;

  const validRequest: CreateBudgetRequestDTO = {
    name: 'Groceries',
    type: 'spending',
    currency: 'UAH',
    targetAmount: 1000000,
    targetCadence: null,
    targetCadenceMonths: null,
    targetDate: null,
    startDate: null,
    endDate: null,
  };

  beforeEach(() => {
    mockBudgetRepository = createMockBudgetRepository();
    useCase = new CreateBudgetUseCase(mockBudgetRepository);
  });

  test('should create a budget and return it', async () => {
    const result = await useCase.execute(validRequest);

    expect(result.name).toBe('Groceries');
    expect(result.type).toBe('spending');
    expect(result.amount.amount).toBe(1000000);
    expect(result.amount.currency.code).toBe('UAH');
    expect(result.isArchived).toBe(false);
    expect(mockBudgetRepository.saveAndReturn).toHaveBeenCalledTimes(1);
  });

  test('should throw BudgetNameTakenError when name already exists', async () => {
    const existingBudget = createTestBudget({ name: 'Groceries' });
    mockBudgetRepository.findByName = mock(() =>
      Promise.resolve(existingBudget),
    );

    await expect(useCase.execute(validRequest)).rejects.toThrow(
      BudgetNameTakenError,
    );
    expect(mockBudgetRepository.saveAndReturn).not.toHaveBeenCalled();
  });

  test('should create budget with goal type and target date', async () => {
    const goalRequest: CreateBudgetRequestDTO = {
      ...validRequest,
      name: 'Vacation',
      type: 'goal',
      targetAmount: 5000000,
      targetDate: '2026-07-01',
    };

    const result = await useCase.execute(goalRequest);

    expect(result.type).toBe('goal');
    expect(result.targetDate).toEqual(new Date('2026-07-01'));
    expect(result.amount.amount).toBe(5000000);
  });

  test('should create budget with periodic cadence', async () => {
    const periodicRequest: CreateBudgetRequestDTO = {
      ...validRequest,
      name: 'Car Insurance',
      type: 'periodic',
      targetCadence: 'yearly',
      targetCadenceMonths: null,
    };

    const result = await useCase.execute(periodicRequest);

    expect(result.type).toBe('periodic');
    expect(result.targetCadence).toBe('yearly');
  });

  test('should create budget with start and end dates', async () => {
    const request: CreateBudgetRequestDTO = {
      ...validRequest,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };

    const result = await useCase.execute(request);

    expect(result.startDate).toEqual(new Date('2026-01-01'));
    expect(result.endDate).toEqual(new Date('2026-12-31'));
  });
});
