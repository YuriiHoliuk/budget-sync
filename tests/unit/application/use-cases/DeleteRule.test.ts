import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { DeleteRuleUseCase } from '@application/use-cases/DeleteRule.ts';
import { RuleNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { CategorizationRuleRepository } from '@domain/repositories/CategorizationRuleRepository.ts';
import {
  createMockCategorizationRuleRepository,
  createTestRule,
} from '../../helpers';

describe('DeleteRuleUseCase', () => {
  let mockRepository: CategorizationRuleRepository;
  let useCase: DeleteRuleUseCase;

  beforeEach(() => {
    mockRepository = createMockCategorizationRuleRepository();
    useCase = new DeleteRuleUseCase(mockRepository);
  });

  test('should delete an existing rule', async () => {
    const existing = createTestRule({ dbId: 1 });
    mockRepository.findById = mock(() => Promise.resolve(existing));

    await useCase.execute({ id: 1 });

    expect(mockRepository.delete).toHaveBeenCalledTimes(1);
  });

  test('should throw RuleNotFoundError when rule does not exist', async () => {
    mockRepository.findById = mock(() => Promise.resolve(null));

    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      RuleNotFoundError,
    );
    expect(mockRepository.delete).not.toHaveBeenCalled();
  });
});
