/**
 * API Integration Tests for Account Query
 *
 * Tests the GraphQL account query against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/account-query.test.ts
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

describe('Query: account', () => {
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

  test('should return single account by id', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'My Account',
    });

    const result = await harness.executeQuery<{
      account: { id: number; name: string } | null;
    }>(
      `
      query GetAccount($id: Int!) {
        account(id: $id) {
          id
          name
        }
      }
    `,
      { id: account.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.account?.name).toBe('My Account');
  });

  test('should return null for non-existent account', async () => {
    const result = await harness.executeQuery<{
      account: { id: number; name: string } | null;
    }>(
      `
      query GetAccount($id: Int!) {
        account(id: $id) {
          id
          name
        }
      }
    `,
      { id: 99999 },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.account).toBeNull();
  });
});
