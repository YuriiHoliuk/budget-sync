/**
 * API Integration Tests for Archive Account Mutation
 *
 * Tests the GraphQL archiveAccount mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/archive-account.test.ts
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

describe('Mutation: archiveAccount', () => {
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

  test('should archive an account', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account To Archive',
      isArchived: false,
    });

    const result = await harness.executeQuery<{
      archiveAccount: { id: number; name: string };
    }>(
      `
      mutation ArchiveAccount($id: Int!) {
        archiveAccount(id: $id) {
          id
          name
        }
      }
    `,
      { id: account.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.archiveAccount.id).toBe(account.id);

    // Verify account is no longer in active list
    const listResult = await harness.executeQuery<{
      accounts: Array<{ id: number }>;
    }>(`
      query {
        accounts {
          id
        }
      }
    `);

    expect(listResult.data?.accounts).toHaveLength(0);
  });
});
