/**
 * API Integration Tests for Archive Category Mutation
 *
 * Tests the GraphQL archiveCategory mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/archive-category.test.ts
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
import { clearAllTestData, createTestCategory } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: archiveCategory', () => {
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

  test('should archive a category', async () => {
    const category = await createTestCategory(harness.getDb(), {
      name: 'Category To Archive',
      status: 'active',
    });

    const result = await harness.executeQuery<{
      archiveCategory: { id: number; name: string; status: string };
    }>(
      `
      mutation ArchiveCategory($id: Int!) {
        archiveCategory(id: $id) {
          id
          name
          status
        }
      }
    `,
      { id: category.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.archiveCategory.id).toBe(category.id);
    expect(result.data?.archiveCategory.status).toBe('ARCHIVED');

    // Verify category is no longer in active list
    const listResult = await harness.executeQuery<{
      categories: Array<{ id: number }>;
    }>(`
      query {
        categories(activeOnly: true) {
          id
        }
      }
    `);

    expect(listResult.data?.categories).toHaveLength(0);
  });
});
