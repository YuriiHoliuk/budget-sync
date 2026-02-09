/**
 * API Integration Tests for Category Query
 *
 * Tests the GraphQL category query (single category by ID) against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/category-query.test.ts
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

describe('Query: category', () => {
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

  test('should return single category by id', async () => {
    const category = await createTestCategory(harness.getDb(), {
      name: 'Food',
    });

    const result = await harness.executeQuery<{
      category: { id: number; name: string } | null;
    }>(
      `
      query GetCategory($id: Int!) {
        category(id: $id) {
          id
          name
        }
      }
    `,
      { id: category.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.category?.name).toBe('Food');
  });

  test('should return null for non-existent category', async () => {
    const result = await harness.executeQuery<{
      category: { id: number; name: string } | null;
    }>(
      `
      query GetCategory($id: Int!) {
        category(id: $id) {
          id
          name
        }
      }
    `,
      { id: 99999 },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.category).toBeNull();
  });
});
