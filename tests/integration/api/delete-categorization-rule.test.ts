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

const DELETE_MUTATION = `
  mutation DeleteCategorizationRule($id: Int!) {
    deleteCategorizationRule(id: $id)
  }
`;

const QUERY_RULES = `
  query {
    categorizationRules {
      id
      rule
    }
  }
`;

describe('Mutation: deleteCategorizationRule', () => {
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

  test('should delete an existing rule', async () => {
    const created = await createTestCategorizationRule(harness.getDb(), {
      rule: 'Rule to delete',
    });

    const result = await harness.executeQuery<{
      deleteCategorizationRule: boolean;
    }>(DELETE_MUTATION, { id: created.id });

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteCategorizationRule).toBe(true);

    // Verify rule is gone
    const queryResult = await harness.executeQuery<{
      categorizationRules: unknown[];
    }>(QUERY_RULES);
    expect(queryResult.data?.categorizationRules).toHaveLength(0);
  });

  test('should return error when rule does not exist', async () => {
    const result = await harness.executeQuery(DELETE_MUTATION, { id: 99999 });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Rule not found');
  });
});
