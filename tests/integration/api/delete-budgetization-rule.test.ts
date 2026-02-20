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

const DELETE_MUTATION = `
  mutation DeleteBudgetizationRule($id: Int!) {
    deleteBudgetizationRule(id: $id)
  }
`;

describe('Mutation: deleteBudgetizationRule', () => {
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

  test('should delete an existing budgetization rule', async () => {
    const created = await createTestBudgetizationRule(harness.getDb(), {
      rule: 'To be deleted',
    });

    const result = await harness.executeQuery<{
      deleteBudgetizationRule: boolean;
    }>(DELETE_MUTATION, { id: created.id });

    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteBudgetizationRule).toBe(true);
  });

  test('should return error when rule does not exist', async () => {
    const result = await harness.executeQuery(DELETE_MUTATION, { id: 99999 });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Rule not found');
  });
});
