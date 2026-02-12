/**
 * API Integration Tests for Budget Groups
 *
 * Tests the GraphQL budget group operations (CRUD + reorder) against real database.
 *
 * Run with: just test-api-file tests/integration/api/budget-groups.test.ts
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
import { budgetGroups } from '@modules/database/schema/index.ts';
import { clearAllTestData, createTestBudget } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

const GET_BUDGET_GROUPS_QUERY = `
  query GetBudgetGroups {
    budgetGroups {
      id
      name
      sortOrder
    }
  }
`;

const CREATE_BUDGET_GROUP_MUTATION = `
  mutation CreateBudgetGroup($name: String!) {
    createBudgetGroup(name: $name) {
      id
      name
      sortOrder
    }
  }
`;

const UPDATE_BUDGET_GROUP_MUTATION = `
  mutation UpdateBudgetGroup($id: Int!, $name: String!) {
    updateBudgetGroup(id: $id, name: $name) {
      id
      name
      sortOrder
    }
  }
`;

const DELETE_BUDGET_GROUP_MUTATION = `
  mutation DeleteBudgetGroup($id: Int!) {
    deleteBudgetGroup(id: $id)
  }
`;

const REORDER_BUDGET_GROUP_MUTATION = `
  mutation ReorderBudgetGroup($input: ReorderBudgetGroupInput!) {
    reorderBudgetGroup(input: $input) {
      id
      name
      sortOrder
    }
  }
`;

const GET_BUDGET_QUERY = `
  query GetBudget($id: Int!) {
    budget(id: $id) {
      id
      name
      budgetGroupId
    }
  }
`;

const CREATE_BUDGET_MUTATION = `
  mutation CreateBudget($input: CreateBudgetInput!) {
    createBudget(input: $input) {
      id
      name
      budgetGroupId
    }
  }
`;

interface BudgetGroupResult {
  id: number;
  name: string;
  sortOrder: string | null;
}

interface BudgetResult {
  id: number;
  name: string;
  budgetGroupId: number | null;
}

describe('Budget Groups API', () => {
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

  describe('Query: budgetGroups', () => {
    test('should return empty array when no groups exist', async () => {
      const result = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      expect(result.errors).toBeUndefined();
      expect(result.data?.budgetGroups).toEqual([]);
    });

    test('should return groups ordered by sortOrder', async () => {
      const db = harness.getDb();

      // Create groups directly in DB to control sortOrder
      await db.insert(budgetGroups).values([
        { name: 'Group B', sortOrder: 'a1' },
        { name: 'Group A', sortOrder: 'a0' },
        { name: 'Group C', sortOrder: 'a2' },
      ]);

      const result = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      expect(result.errors).toBeUndefined();
      const names = result.data?.budgetGroups.map((g) => g.name);
      expect(names).toEqual(['Group A', 'Group B', 'Group C']);
    });
  });

  describe('Mutation: createBudgetGroup', () => {
    test('should create a new budget group', async () => {
      const result = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'My New Group' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudgetGroup.name).toBe('My New Group');
      expect(result.data?.createBudgetGroup.id).toBeGreaterThan(0);
      expect(result.data?.createBudgetGroup.sortOrder).toBeTruthy();
    });

    test('should return error for empty name', async () => {
      const result = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: '' });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('empty');
    });

    test('should return error for whitespace-only name', async () => {
      const result = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: '   ' });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('empty');
    });

    test('should append new group to end of list', async () => {
      // Create first group
      await harness.executeQuery<{ createBudgetGroup: BudgetGroupResult }>(
        CREATE_BUDGET_GROUP_MUTATION,
        { name: 'First Group' },
      );

      // Create second group
      await harness.executeQuery<{ createBudgetGroup: BudgetGroupResult }>(
        CREATE_BUDGET_GROUP_MUTATION,
        { name: 'Second Group' },
      );

      // Verify order
      const result = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      const names = result.data?.budgetGroups.map((g) => g.name);
      expect(names).toEqual(['First Group', 'Second Group']);
    });
  });

  describe('Mutation: updateBudgetGroup', () => {
    test('should update group name', async () => {
      // Create a group
      const createResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Original Name' });

      const groupId = createResult.data?.createBudgetGroup.id ?? 0;

      // Update the group
      const result = await harness.executeQuery<{
        updateBudgetGroup: BudgetGroupResult;
      }>(UPDATE_BUDGET_GROUP_MUTATION, { id: groupId, name: 'Updated Name' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.updateBudgetGroup.name).toBe('Updated Name');
    });

    test('should return error for non-existent group', async () => {
      const result = await harness.executeQuery<{
        updateBudgetGroup: BudgetGroupResult;
      }>(UPDATE_BUDGET_GROUP_MUTATION, { id: 99999, name: 'Some Name' });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('not found');
    });

    test('should return error for empty name', async () => {
      const createResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Original Name' });

      const groupId = createResult.data?.createBudgetGroup.id ?? 0;

      const result = await harness.executeQuery<{
        updateBudgetGroup: BudgetGroupResult;
      }>(UPDATE_BUDGET_GROUP_MUTATION, { id: groupId, name: '' });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('empty');
    });
  });

  describe('Mutation: deleteBudgetGroup', () => {
    test('should delete a group', async () => {
      // Create a group
      const createResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'To Delete' });

      const groupId = createResult.data?.createBudgetGroup.id ?? 0;

      // Delete the group
      const result = await harness.executeQuery<{ deleteBudgetGroup: boolean }>(
        DELETE_BUDGET_GROUP_MUTATION,
        { id: groupId },
      );

      expect(result.errors).toBeUndefined();
      expect(result.data?.deleteBudgetGroup).toBe(true);

      // Verify group is gone
      const listResult = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      expect(listResult.data?.budgetGroups).toEqual([]);
    });

    test('should return error for non-existent group', async () => {
      const result = await harness.executeQuery<{ deleteBudgetGroup: boolean }>(
        DELETE_BUDGET_GROUP_MUTATION,
        { id: 99999 },
      );

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('not found');
    });

    test('should ungroup budgets when group is deleted', async () => {
      const db = harness.getDb();

      // Create a group
      const createResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Test Group' });

      const groupId = createResult.data?.createBudgetGroup.id ?? 0;

      // Create a budget in the group
      const budget = await createTestBudget(db, {
        name: 'Grouped Budget',
        budgetGroupId: groupId,
      });

      // Delete the group
      await harness.executeQuery<{ deleteBudgetGroup: boolean }>(
        DELETE_BUDGET_GROUP_MUTATION,
        { id: groupId },
      );

      // Verify budget is now ungrouped
      const budgetResult = await harness.executeQuery<{
        budget: BudgetResult | null;
      }>(GET_BUDGET_QUERY, { id: budget.id });

      expect(budgetResult.data?.budget?.budgetGroupId).toBeNull();
    });
  });

  describe('Mutation: reorderBudgetGroup', () => {
    test('should move group to beginning', async () => {
      // Create 3 groups
      const groupAResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group A' });

      await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group B' });

      const groupCResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group C' });

      const groupA = groupAResult.data?.createBudgetGroup;
      const groupC = groupCResult.data?.createBudgetGroup;

      // Move C to beginning (before A)
      const result = await harness.executeQuery<{
        reorderBudgetGroup: BudgetGroupResult;
      }>(REORDER_BUDGET_GROUP_MUTATION, {
        input: {
          groupId: groupC?.id,
          afterGroupId: null,
          beforeGroupId: groupA?.id,
        },
      });

      expect(result.errors).toBeUndefined();

      // Verify new order: C, A, B
      const listResult = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      const names = listResult.data?.budgetGroups.map((g) => g.name);
      expect(names).toEqual(['Group C', 'Group A', 'Group B']);
    });

    test('should move group to end', async () => {
      // Create 3 groups
      const groupAResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group A' });

      await harness.executeQuery<{ createBudgetGroup: BudgetGroupResult }>(
        CREATE_BUDGET_GROUP_MUTATION,
        { name: 'Group B' },
      );

      const groupCResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group C' });

      const groupA = groupAResult.data?.createBudgetGroup;
      const groupC = groupCResult.data?.createBudgetGroup;

      // Move A to end (after C)
      const result = await harness.executeQuery<{
        reorderBudgetGroup: BudgetGroupResult;
      }>(REORDER_BUDGET_GROUP_MUTATION, {
        input: {
          groupId: groupA?.id,
          afterGroupId: groupC?.id,
          beforeGroupId: null,
        },
      });

      expect(result.errors).toBeUndefined();

      // Verify new order: B, C, A
      const listResult = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      const names = listResult.data?.budgetGroups.map((g) => g.name);
      expect(names).toEqual(['Group B', 'Group C', 'Group A']);
    });

    test('should move group to middle', async () => {
      // Create 3 groups
      const groupAResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group A' });

      const groupBResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group B' });

      const groupCResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'Group C' });

      const groupA = groupAResult.data?.createBudgetGroup;
      const groupB = groupBResult.data?.createBudgetGroup;
      const groupC = groupCResult.data?.createBudgetGroup;

      // Move A to between B and C
      const result = await harness.executeQuery<{
        reorderBudgetGroup: BudgetGroupResult;
      }>(REORDER_BUDGET_GROUP_MUTATION, {
        input: {
          groupId: groupA?.id,
          afterGroupId: groupB?.id,
          beforeGroupId: groupC?.id,
        },
      });

      expect(result.errors).toBeUndefined();

      // Verify new order: B, A, C
      const listResult = await harness.executeQuery<{
        budgetGroups: BudgetGroupResult[];
      }>(GET_BUDGET_GROUPS_QUERY);

      const names = listResult.data?.budgetGroups.map((g) => g.name);
      expect(names).toEqual(['Group B', 'Group A', 'Group C']);
    });

    test('should return error for non-existent group', async () => {
      const result = await harness.executeQuery<{
        reorderBudgetGroup: BudgetGroupResult;
      }>(REORDER_BUDGET_GROUP_MUTATION, {
        input: {
          groupId: 99999,
          afterGroupId: null,
          beforeGroupId: null,
        },
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('not found');
    });
  });

  describe('Budget Group Assignment', () => {
    test('should create budget with group assignment', async () => {
      // Create a group
      const groupResult = await harness.executeQuery<{
        createBudgetGroup: BudgetGroupResult;
      }>(CREATE_BUDGET_GROUP_MUTATION, { name: 'My Group' });

      const groupId = groupResult.data?.createBudgetGroup.id ?? 0;

      // Create budget in the group
      const result = await harness.executeQuery<{
        createBudget: BudgetResult;
      }>(CREATE_BUDGET_MUTATION, {
        input: {
          name: 'Test Budget',
          currency: 'UAH',
          targetAmount: 1000,
          budgetGroupId: groupId,
        },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudget.budgetGroupId).toBe(groupId);
    });

    test('should create budget without group', async () => {
      const result = await harness.executeQuery<{
        createBudget: BudgetResult;
      }>(CREATE_BUDGET_MUTATION, {
        input: {
          name: 'Ungrouped Budget',
          currency: 'UAH',
          targetAmount: 1000,
        },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.createBudget.budgetGroupId).toBeNull();
    });
  });
});
