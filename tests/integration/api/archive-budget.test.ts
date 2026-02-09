/**
 * API Integration Tests for Archive Budget Mutation
 *
 * Tests the GraphQL archiveBudget mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: just test-api-file tests/integration/api/archive-budget.test.ts
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

describe('Mutation: archiveBudget', () => {
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

  test('should archive a budget', async () => {
    const budget = await createTestBudget(harness.getDb(), {
      name: 'Budget To Archive',
      isArchived: false,
    });

    const result = await harness.executeQuery<{
      archiveBudget: { id: number; name: string; isArchived: boolean };
    }>(
      `
      mutation ArchiveBudget($id: Int!) {
        archiveBudget(id: $id) {
          id
          name
          isArchived
        }
      }
    `,
      { id: budget.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.archiveBudget.id).toBe(budget.id);
    expect(result.data?.archiveBudget.isArchived).toBe(true);

    // Verify budget is no longer in active list
    const listResult = await harness.executeQuery<{
      budgets: Array<{ id: number }>;
    }>(`
      query {
        budgets(activeOnly: true) {
          id
        }
      }
    `);

    expect(listResult.data?.budgets).toHaveLength(0);
  });
});
