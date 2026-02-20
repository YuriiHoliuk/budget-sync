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
  createTestCategorizationRule,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const UPDATE_MUTATION = `
  mutation UpdateCategorizationRule($input: UpdateRuleInput!) {
    updateCategorizationRule(input: $input) {
      id
      rule
      priority
      updatedAt
    }
  }
`;

describe('Mutation: updateCategorizationRule', () => {
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

  test('should update rule text', async () => {
    const created = await createTestCategorizationRule(harness.getDb(), {
      rule: 'Original text',
      priority: 5,
    });

    const result = await harness.executeQuery<{
      updateCategorizationRule: { id: number; rule: string; priority: number };
    }>(UPDATE_MUTATION, {
      input: { id: created.id, rule: 'Updated text' },
    });

    expect(result.errors).toBeUndefined();
    const rule = result.data?.updateCategorizationRule;
    expect(rule?.id).toBe(created.id);
    expect(rule?.rule).toBe('Updated text');
    expect(rule?.priority).toBe(5);
  });

  test('should update rule priority', async () => {
    const created = await createTestCategorizationRule(harness.getDb(), {
      rule: 'Keep this text',
      priority: 0,
    });

    const result = await harness.executeQuery<{
      updateCategorizationRule: { rule: string; priority: number };
    }>(UPDATE_MUTATION, {
      input: { id: created.id, priority: 20 },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateCategorizationRule.rule).toBe('Keep this text');
    expect(result.data?.updateCategorizationRule.priority).toBe(20);
  });

  test('should return error when rule does not exist', async () => {
    const result = await harness.executeQuery(UPDATE_MUTATION, {
      input: { id: 99999, rule: 'New text' },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Rule not found');
  });
});
