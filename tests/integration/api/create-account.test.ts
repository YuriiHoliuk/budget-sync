/**
 * API Integration Tests for Create Account Mutation
 *
 * Tests the GraphQL createAccount mutation against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/create-account.test.ts
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
import { clearAllTestData } from './test-factories.ts';
import { TestHarness } from './test-harness.ts';

const harness = new TestHarness();

describe('Mutation: createAccount', () => {
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

  test('should create a manual account', async () => {
    const result = await harness.executeQuery<{
      createAccount: {
        id: number;
        name: string;
        type: string;
        currency: string;
        balance: number;
        source: string;
      };
    }>(
      `
      mutation CreateAccount($input: CreateAccountInput!) {
        createAccount(input: $input) {
          id
          name
          type
          currency
          balance
          source
        }
      }
    `,
      {
        input: {
          name: 'Cash Wallet',
          type: 'DEBIT',
          role: 'OPERATIONAL',
          currency: 'UAH',
          balance: 1000,
        },
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.createAccount.name).toBe('Cash Wallet');
    expect(result.data?.createAccount.type).toBe('DEBIT');
    expect(result.data?.createAccount.balance).toBe(1000);
    expect(result.data?.createAccount.source).toBe('MANUAL'); // Created accounts are manual
  });
});
