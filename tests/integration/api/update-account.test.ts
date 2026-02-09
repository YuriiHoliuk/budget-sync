/**
 * API Integration Tests for Update Account Mutation
 *
 * Tests the GraphQL updateAccount mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/update-account.test.ts
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
import { clearAllTestData, createTestAccount } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: updateAccount', () => {
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

  test('should update manual account name', async () => {
    // Create a manual account
    const account = await createTestAccount(harness.getDb(), {
      name: 'Old Name',
      source: 'manual',
    });

    const result = await harness.executeQuery<{
      updateAccount: { id: number; name: string };
    }>(
      `
      mutation UpdateAccount($input: UpdateAccountInput!) {
        updateAccount(input: $input) {
          id
          name
        }
      }
    `,
      {
        input: {
          id: account.id,
          name: 'New Name',
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.updateAccount.name).toBe('New Name');
  });
});
