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

const UPDATE_MUTATION = `
  mutation UpdateBudgetizationRule($input: UpdateRuleInput!) {
    updateBudgetizationRule(input: $input) {
      id
      rule
      priority
    }
  }
`;

describe('Mutation: updateBudgetizationRule', () => {
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

  test('should update budgetization rule text', async () => {
    const created = await createTestBudgetizationRule(harness.getDb(), {
      rule: 'Original',
    });

    const result = await harness.executeQuery<{
      updateBudgetizationRule: { rule: string };
    }>(UPDATE_MUTATION, {
      input: { id: created.id, rule: 'Updated' },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBudgetizationRule.rule).toBe('Updated');
  });

  test('should return error when rule does not exist', async () => {
    const result = await harness.executeQuery(UPDATE_MUTATION, {
      input: { id: 99999, rule: 'New' },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Rule not found');
  });
});
