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
  mutation CreateCategorizationRule($input: CreateRuleInput!) {
    createCategorizationRule(input: $input) {
      id
      rule
      priority
      createdAt
      updatedAt
    }
  }
`;

describe('Mutation: createCategorizationRule', () => {
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

  test('should create a rule with text and default priority', async () => {
    const result = await harness.executeQuery<{
      createCategorizationRule: {
        id: number;
        rule: string;
        priority: number;
      };
    }>(CREATE_MUTATION, {
      input: { rule: 'Assign Bolt to Transport > Taxi' },
    });

    expect(result.errors).toBeUndefined();
    const rule = result.data?.createCategorizationRule;
    expect(rule?.id).toBeGreaterThan(0);
    expect(rule?.rule).toBe('Assign Bolt to Transport > Taxi');
    expect(rule?.priority).toBe(0);
  });

  test('should create a rule with custom priority', async () => {
    const result = await harness.executeQuery<{
      createCategorizationRule: { priority: number };
    }>(CREATE_MUTATION, {
      input: { rule: 'High priority rule', priority: 10 },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.createCategorizationRule.priority).toBe(10);
  });

  test('should return error for empty rule text', async () => {
    const result = await harness.executeQuery(CREATE_MUTATION, {
      input: { rule: '' },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('Rule text cannot be empty');
  });
});
