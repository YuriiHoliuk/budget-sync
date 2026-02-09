/**
 * API Integration Tests for Verify Transaction Mutation
 *
 * Tests the GraphQL verifyTransaction mutation.
 *
 * Run with: bun test tests/integration/api/verify-transaction.test.ts
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
import {
  clearAllTestData,
  createTestAccount,
  createTestTransaction,
} from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: verifyTransaction', () => {
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

  test('should mark transaction as verified', async () => {
    const account = await createTestAccount(harness.getDb(), {
      name: 'Account',
    });
    const transaction = await createTestTransaction(harness.getDb(), {
      accountId: account.id,
      accountExternalId: account.externalId,
      categorizationStatus: 'pending',
    });

    const result = await harness.executeQuery<{
      verifyTransaction: {
        id: number;
        categorizationStatus: string;
      };
    }>(
      `
      mutation VerifyTransaction($id: Int!) {
        verifyTransaction(id: $id) {
          id
          categorizationStatus
        }
      }
    `,
      { id: transaction.id },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.verifyTransaction.categorizationStatus).toBe(
      'VERIFIED',
    );
  });
});
