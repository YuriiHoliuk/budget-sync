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

describe('Query: categorizationRules', () => {
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
      categorizationRules: unknown[];
    }>(`
      query {
        categorizationRules {
          id
          rule
          priority
          createdAt
          updatedAt
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categorizationRules).toEqual([]);
  });

  test('should return all categorization rules ordered by priority desc', async () => {
    await createTestCategorizationRule(harness.getDb(), {
      rule: 'Low priority rule',
      priority: 1,
    });
    await createTestCategorizationRule(harness.getDb(), {
      rule: 'High priority rule',
      priority: 10,
    });
    await createTestCategorizationRule(harness.getDb(), {
      rule: 'Medium priority rule',
      priority: 5,
    });

    const result = await harness.executeQuery<{
      categorizationRules: Array<{
        id: number;
        rule: string;
        priority: number;
      }>;
    }>(`
      query {
        categorizationRules {
          id
          rule
          priority
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categorizationRules).toHaveLength(3);

    const rules = result.data?.categorizationRules ?? [];
    expect(rules[0]?.rule).toBe('High priority rule');
    expect(rules[0]?.priority).toBe(10);
    expect(rules[1]?.rule).toBe('Medium priority rule');
    expect(rules[2]?.rule).toBe('Low priority rule');
  });

  test('should return createdAt and updatedAt as ISO strings', async () => {
    await createTestCategorizationRule(harness.getDb(), {
      rule: 'Test rule',
    });

    const result = await harness.executeQuery<{
      categorizationRules: Array<{ createdAt: string; updatedAt: string }>;
    }>(`
      query {
        categorizationRules {
          createdAt
          updatedAt
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    const rule = result.data?.categorizationRules[0];
    expect(rule?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rule?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
