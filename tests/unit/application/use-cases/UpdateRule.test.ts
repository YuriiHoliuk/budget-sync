import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { UpdateRuleUseCase } from '@application/use-cases/UpdateRule.ts';
import { RuleNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import {
  createMockCategorizationRuleRepository,
  createTestRule,
} from '../../helpers';

describe('UpdateRuleUseCase', () => {
  let mockRepository: CategorizationRuleRepository;
  let useCase: UpdateRuleUseCase;

  beforeEach(() => {
    mockRepository = createMockCategorizationRuleRepository();
    useCase = new UpdateRuleUseCase(mockRepository);
  });

  test('should update rule text', async () => {
    const existing = createTestRule({ dbId: 1, rule: 'Original rule' });
    mockRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1, rule: 'Updated rule' });

    expect(result.rule).toBe('Updated rule');
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update rule priority', async () => {
    const existing = createTestRule({ dbId: 1, priority: 0 });
    mockRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1, priority: 10 });

    expect(result.priority).toBe(10);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
  });

  test('should update both rule text and priority', async () => {
    const existing = createTestRule({ dbId: 1, rule: 'Old', priority: 0 });
    mockRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({
      id: 1,
      rule: 'New text',
      priority: 5,
    });

    expect(result.rule).toBe('New text');
    expect(result.priority).toBe(5);
  });

  test('should throw RuleNotFoundError when rule does not exist', async () => {
    mockRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999, rule: 'New' })).rejects.toThrow(
      RuleNotFoundError,
    );
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  test('should keep original values when no updates provided', async () => {
    const existing = createTestRule({
      dbId: 1,
      rule: 'Keep this',
      priority: 5,
    });
    mockRepository.findById = mock(() => Promise.resolve(existing));

    const result = await useCase.execute({ id: 1 });

    expect(result.rule).toBe('Keep this');
    expect(result.priority).toBe(5);
  });
});
