import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { CreateRuleUseCase } from '@application/use-cases/CreateRule.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import { createMockCategorizationRuleRepository } from '../../helpers';

describe('CreateRuleUseCase', () => {
  let mockRepository: CategorizationRuleRepository;
  let useCase: CreateRuleUseCase;

  beforeEach(() => {
    mockRepository = createMockCategorizationRuleRepository();
    useCase = new CreateRuleUseCase(mockRepository);
  });

  test('should create a rule with text and default priority', async () => {
    const result = await useCase.execute({
      rule: 'Assign Bolt transactions to Transport > Taxi',
    });

    expect(result.rule).toBe('Assign Bolt transactions to Transport > Taxi');
    expect(result.priority).toBe(0);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  test('should create a rule with custom priority', async () => {
    const result = await useCase.execute({
      rule: 'High priority rule',
      priority: 10,
    });

    expect(result.rule).toBe('High priority rule');
    expect(result.priority).toBe(10);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  test('should throw error when rule text is empty', async () => {
    await expect(useCase.execute({ rule: '' })).rejects.toThrow(
      'Rule text cannot be empty',
    );
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  test('should throw error when rule text is whitespace', async () => {
    await expect(useCase.execute({ rule: '   ' })).rejects.toThrow(
      'Rule text cannot be empty',
    );
    expect(mockRepository.save).not.toHaveBeenCalled();
  });
});
