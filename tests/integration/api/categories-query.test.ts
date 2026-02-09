/**
 * API Integration Tests for Categories Query
 *
 * Tests the GraphQL categories query against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/categories-query.test.ts
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

describe('Query: categories', () => {
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

  test('should return empty array when no categories exist', async () => {
    const result = await harness.executeQuery<{ categories: unknown[] }>(`
      query {
        categories {
          id
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categories).toEqual([]);
  });

  test('should return all active categories', async () => {
    await createTestCategory(harness.getDb(), { name: 'Food' });
    await createTestCategory(harness.getDb(), { name: 'Transport' });

    const result = await harness.executeQuery<{
      categories: Array<{ id: number; name: string; status: string }>;
    }>(`
      query {
        categories {
          id
          name
          status
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categories).toHaveLength(2);

    const names = result.data?.categories.map((cat) => cat.name);
    expect(names).toContain('Food');
    expect(names).toContain('Transport');
  });

  test('should return category with full path for nested categories', async () => {
    const parentCategory = await createTestCategory(harness.getDb(), {
      name: 'Food',
    });
    await createTestCategory(harness.getDb(), {
      name: 'Groceries',
      parentId: parentCategory.id,
    });

    const result = await harness.executeQuery<{
      categories: Array<{
        id: number;
        name: string;
        fullPath: string;
        parentName: string | null;
      }>;
    }>(`
      query {
        categories {
          id
          name
          fullPath
          parentName
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categories).toHaveLength(2);

    const groceries = result.data?.categories.find(
      (cat) => cat.name === 'Groceries',
    );
    expect(groceries?.parentName).toBe('Food');
    expect(groceries?.fullPath).toBe('Food > Groceries');

    const food = result.data?.categories.find((cat) => cat.name === 'Food');
    expect(food?.parentName).toBeNull();
    expect(food?.fullPath).toBe('Food');
  });

  test('should exclude archived categories when activeOnly is true', async () => {
    await createTestCategory(harness.getDb(), {
      name: 'Active Category',
      status: 'active',
    });
    await createTestCategory(harness.getDb(), {
      name: 'Archived Category',
      status: 'archived',
    });

    const result = await harness.executeQuery<{
      categories: Array<{ name: string }>;
    }>(`
      query {
        categories(activeOnly: true) {
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categories).toHaveLength(1);
    expect(result.data?.categories[0]?.name).toBe('Active Category');
  });

  test('should include all categories when activeOnly is false', async () => {
    await createTestCategory(harness.getDb(), {
      name: 'Active Category',
      status: 'active',
    });
    await createTestCategory(harness.getDb(), {
      name: 'Archived Category',
      status: 'archived',
    });

    const result = await harness.executeQuery<{
      categories: Array<{ name: string }>;
    }>(`
      query {
        categories(activeOnly: false) {
          name
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data?.categories).toHaveLength(2);
  });

  test('should resolve children for parent categories', async () => {
    const parent = await createTestCategory(harness.getDb(), {
      name: 'Food',
    });
    await createTestCategory(harness.getDb(), {
      name: 'Groceries',
      parentId: parent.id,
    });
    await createTestCategory(harness.getDb(), {
      name: 'Restaurants',
      parentId: parent.id,
    });

    const result = await harness.executeQuery<{
      categories: Array<{
        id: number;
        name: string;
        children: Array<{ id: number; name: string }>;
      }>;
    }>(`
      query {
        categories {
          id
          name
          children {
            id
            name
          }
        }
      }
    `);

    expect(result.errors).toBeUndefined();

    const foodCategory = result.data?.categories.find(
      (cat) => cat.name === 'Food',
    );
    expect(foodCategory?.children).toHaveLength(2);

    const childNames = foodCategory?.children.map((child) => child.name);
    expect(childNames).toContain('Groceries');
    expect(childNames).toContain('Restaurants');
  });
});
