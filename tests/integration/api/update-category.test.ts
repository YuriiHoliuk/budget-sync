/**
 * API Integration Tests for Update Category Mutation
 *
 * Tests the GraphQL updateCategory mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/update-category.test.ts
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

describe('Mutation: updateCategory', () => {
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

  test('should update category name', async () => {
    const category = await createTestCategory(harness.getDb(), {
      name: 'Old Name',
    });

    const result = await harness.executeQuery<{
      updateCategory: { id: number; name: string };
    }>(
      `
      mutation UpdateCategory($input: UpdateCategoryInput!) {
        updateCategory(input: $input) {
          id
          name
        }
      }
    `,
      {
        input: {
          id: category.id,
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateCategory.name).toBe('New Name');
  });

  test('should update category status', async () => {
    const category = await createTestCategory(harness.getDb(), {
      name: 'Category',
      status: 'active',
    });

    const result = await harness.executeQuery<{
      updateCategory: { id: number; status: string };
    }>(
      `
      mutation UpdateCategory($input: UpdateCategoryInput!) {
        updateCategory(input: $input) {
          id
          status
        }
      }
    `,
      {
        input: {
          id: category.id,
          status: 'ARCHIVED',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateCategory.status).toBe('ARCHIVED');
  });
});
