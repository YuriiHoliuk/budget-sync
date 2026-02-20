import 'reflect-metadata';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  clearAllTestData,
  createTestBudgetizationRule,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Query: budgetizationRules', () => {
  beforeAll(async () => {
    await harness.setup();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  afterEach(async () => {
    await clearAllTestData(harness.getDb());
  });

  test('should return empty array when no rules exist', async () => {
    const result = await harness.executeQuery<{
      budgetizationRules: unknown[];
    }>(`
      query {
        budgetizationRules {
          id
          rule
          priority
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgetizationRules).toEqual([]);
  });

  test('should return all budgetization rules ordered by priority desc', async () => {
    await createTestBudgetizationRule(harness.getDb(), {
      rule: 'Low priority',
      priority: 1,
    });
    await createTestBudgetizationRule(harness.getDb(), {
      rule: 'High priority',
      priority: 10,
    });

    const result = await harness.executeQuery<{
      budgetizationRules: Array<{ rule: string; priority: number }>;
    }>(`
      query {
        budgetizationRules {
          rule
          priority
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.budgetizationRules).toHaveLength(2);
    expect(result.data?.budgetizationRules[0]?.rule).toBe('High priority');
    expect(result.data?.budgetizationRules[1]?.rule).toBe('Low priority');
  });
});
