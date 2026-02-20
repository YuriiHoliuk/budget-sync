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
import { clearAllTestData } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const CREATE_MUTATION = `
  mutation CreateBudgetizationRule($input: CreateRuleInput!) {
    createBudgetizationRule(input: $input) {
      id
      rule
      priority
    }
  }
`;

describe('Mutation: createBudgetizationRule', () => {
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

  test('should create a budgetization rule', async () => {
    const result = await harness.executeQuery<{
      createBudgetizationRule: { id: number; rule: string; priority: number };
    }>(CREATE_MUTATION, {
      input: {
        rule: 'Assign Transport category to Transport budget',
        priority: 5,
      },
    });

    expect(result.errors).toBeUndefined();
    const rule = result.data?.createBudgetizationRule;
    expect(rule?.id).toBeGreaterThan(0);
    expect(rule?.rule).toBe('Assign Transport category to Transport budget');
    expect(rule?.priority).toBe(5);
  });

  test('should return error for empty rule text', async () => {
    const result = await harness.executeQuery(CREATE_MUTATION, {
      input: { rule: '' },
    });

    expect(result.errors).toBeDefined();
  });
});
