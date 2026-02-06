/**
 * API Integration Tests for Categories
 *
 * Tests the GraphQL categories queries and mutations against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/categories.test.ts
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

describe('Categories API Integration', () => {
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

  describe('Query: categories', () => {
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

  describe('Query: category', () => {
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

  describe('Mutation: createCategory', () => {
    test('should create a top-level category', async () => {
      const result = await harness.executeQuery<{
        createCategory: {
          id: number;
          name: string;
          status: string;
          fullPath: string;
        };
      }>(
        `
        mutation CreateCategory($input: CreateCategoryInput!) {
          createCategory(input: $input) {
            id
            name
            status
            fullPath
          }
        }
      `,
        {
          input: {
            name: 'Entertainment',
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createCategory.name).toBe('Entertainment');
      expect(result.data?.createCategory.status).toBe('ACTIVE');
      expect(result.data?.createCategory.fullPath).toBe('Entertainment');
    });

    test('should create a child category', async () => {
      // First create parent
      await createTestCategory(harness.getDb(), {
        name: 'Food',
      });

      const result = await harness.executeQuery<{
        createCategory: {
          id: number;
          name: string;
          parentName: string | null;
          fullPath: string;
        };
      }>(
        `
        mutation CreateCategory($input: CreateCategoryInput!) {
          createCategory(input: $input) {
            id
            name
            parentName
            fullPath
          }
        }
      `,
        {
          input: {
            name: 'Groceries',
            parentName: 'Food',
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createCategory.name).toBe('Groceries');
      expect(result.data?.createCategory.parentName).toBe('Food');
      expect(result.data?.createCategory.fullPath).toBe('Food > Groceries');
    });

    test('should create category with suggested status', async () => {
      const result = await harness.executeQuery<{
        createCategory: {
          id: number;
          name: string;
          status: string;
        };
      }>(
        `
        mutation CreateCategory($input: CreateCategoryInput!) {
          createCategory(input: $input) {
            id
            name
            status
          }
        }
      `,
        {
          input: {
            name: 'New Suggestion',
            status: 'SUGGESTED',
          },
        },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.createCategory.status).toBe('SUGGESTED');
    });
  });

  describe('Mutation: updateCategory', () => {
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

  describe('Mutation: archiveCategory', () => {
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
});
