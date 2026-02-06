/**
 * API Integration Tests for Accounts
 *
 * Tests the GraphQL accounts queries and mutations against real database.
 * Uses TestHarness for Apollo Server and factory functions for test data.
 *
 * Run with: bun test tests/integration/api/accounts.test.ts
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

describe('Accounts API Integration', () => {
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

  describe('Query: accounts', () => {
    test('should return empty array when no accounts exist', async () => {
      const result = await harness.executeQuery<{ accounts: unknown[] }>(`
        query {
          accounts {
            id
            name
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.accounts).toEqual([]);
    });

    test('should return all active accounts', async () => {
      // Create accounts directly (faster than seedMinimalTestData)
      await createTestAccount(harness.getDb(), {
        name: 'Operational Account',
        role: 'operational',
      });
      await createTestAccount(harness.getDb(), {
        name: 'Savings Account',
        role: 'savings',
      });

      const result = await harness.executeQuery<{
        accounts: Array<{ id: number; name: string; role: string }>;
      }>(`
        query {
          accounts {
            id
            name
            role
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.accounts).toHaveLength(2);

      const names = result.data?.accounts.map((account) => account.name);
      expect(names).toContain('Operational Account');
      expect(names).toContain('Savings Account');
    });

    test('should return account with all fields', async () => {
      await createTestAccount(harness.getDb(), {
        name: 'Full Account',
        type: 'debit',
        currency: 'UAH',
        balance: 500000,
        role: 'operational',
        bank: 'monobank',
        source: 'bank_sync',
      });

      const result = await harness.executeQuery<{
        accounts: Array<{
          id: number;
          name: string;
          type: string;
          currency: string;
          balance: number;
          role: string;
          iban: string | null;
          bank: string | null;
          source: string;
        }>;
      }>(`
        query {
          accounts {
            id
            name
            type
            currency
            balance
            role
            iban
            bank
            source
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.accounts).toHaveLength(1);

      const account = result.data?.accounts[0];
      expect(account?.name).toBe('Full Account');
      expect(account?.type).toBe('DEBIT');
      expect(account?.currency).toBe('UAH');
      expect(account?.balance).toBe(5000); // 500000 minor units = 5000 major units
      expect(account?.role).toBe('OPERATIONAL');
      expect(account?.source).toBe('BANK_SYNC');
    });

    test('should exclude archived accounts by default', async () => {
      await createTestAccount(harness.getDb(), {
        name: 'Active Account',
        isArchived: false,
      });
      await createTestAccount(harness.getDb(), {
        name: 'Archived Account',
        isArchived: true,
      });

      const result = await harness.executeQuery<{
        accounts: Array<{ name: string }>;
      }>(`
        query {
          accounts {
            name
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.accounts).toHaveLength(1);
      expect(result.data?.accounts[0]?.name).toBe('Active Account');
    });

    test('should include archived accounts when activeOnly is false', async () => {
      await createTestAccount(harness.getDb(), {
        name: 'Active Account',
        isArchived: false,
      });
      await createTestAccount(harness.getDb(), {
        name: 'Archived Account',
        isArchived: true,
      });

      const result = await harness.executeQuery<{
        accounts: Array<{ name: string }>;
      }>(`
        query {
          accounts(activeOnly: false) {
            name
          }
        }
      `);

      expect(result.errors).toBeUndefined();
      expect(result.data?.accounts).toHaveLength(2);
    });
  });

  describe('Query: account', () => {
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

  describe('Mutation: createAccount', () => {
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

  describe('Mutation: updateAccount', () => {
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

  describe('Mutation: archiveAccount', () => {
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
});
