/**
 * API Integration Tests for Create Category Mutation
 *
 * Tests the GraphQL createCategory mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/create-category.test.ts
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

describe('Mutation: createCategory', () => {
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
