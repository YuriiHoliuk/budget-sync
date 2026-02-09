/**
 * API Integration Tests for Budget Query
 *
 * Tests the GraphQL budget query (single budget by ID) against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: just test-api-file tests/integration/api/budget-query.test.ts
 */

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
import { clearAllTestData, createTestBudget } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Query: budget', () => {
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

  test('should return single budget by id', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Groceries',
    });

    const result = await harness.executeQuery<{
      budget: { id: number; name: string } | null;
    }>(
      `
      query GetBudget($id: Int!) {
        budget(id: $id) {
          id
          name
        }
      }
    `,
      { id: budget.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.budget?.name).toBe('Groceries');
  });

  test('should return null for non-existent budget', async () => {
    const result = await harness.executeQuery<{
      budget: { id: number; name: string } | null;
    }>(
      `
      query GetBudget($id: Int!) {
        budget(id: $id) {
          id
          name
        }
      }
    `,
      { id: 99999 },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.budget).toBeNull();
  });
});
