import 'reflect-metadata';
import { beforeAll, describe, expect, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import { Transaction } from '@domain/entities/Transaction.ts';
import { MonobankAuthError } from '@infrastructure/gateways/monobank/errors.ts';
import { MonobankGateway } from '@infrastructure/gateways/monobank/MonobankGateway.ts';

/**
 * Integration tests for MonobankGateway
 *
 * These tests require a valid MONOBANK_TOKEN environment variable.
 * Run with: MONOBANK_TOKEN=your_token bun test tests/integration/gateways/MonobankGateway.test.ts
 *
 * NOTE: Monobank API has rate limits (1 request per 60 seconds for most endpoints).
 * Run these tests sparingly to avoid hitting rate limits.
 */
describe('MonobankGateway Integration', () => {
  let gateway: MonobankGateway;

  beforeAll(() => {
    const token = process.env['MONOBANK_TOKEN'];

    if (!token) {
      throw new Error(
        'MONOBANK_TOKEN environment variable is required for integration tests. ' +
          'Get your token from https://api.monobank.ua/',
      );
    }

    gateway = new MonobankGateway({ token });
  });

  describe('getAccounts', () => {
    test('should fetch accounts and return domain objects', async () => {
      const accounts = await gateway.getAccounts();

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);

      const firstAccount = accounts[0];
      expect(firstAccount).toBeInstanceOf(Account);
      expect(typeof firstAccount?.externalId).toBe('string');
      expect(typeof firstAccount?.name).toBe('string');
      expect(firstAccount?.currency).toBeDefined();
      expect(firstAccount?.balance).toBeDefined();
    });

    test('should include account type and IBAN', async () => {
      const accounts = await gateway.getAccounts();
      const firstAccount = accounts[0];

      expect(firstAccount?.type).toBeDefined();
      expect(typeof firstAccount?.iban).toBe('string');
    });
  });

  describe('getTransactions', () => {
    test('should fetch transactions for account and return domain objects', async () => {
      // First, get accounts to use a valid account ID
      const accounts = await gateway.getAccounts();
      const account = accounts[0];

      if (!account) {
        throw new Error('No accounts available for transaction test');
      }

      // Wait 60 seconds due to rate limit (if running sequentially)
      // In practice, you might want to run this test separately

      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const transactions = await gateway.getTransactions(
        account.externalId,
        from,
        to,
      );

      expect(Array.isArray(transactions)).toBe(true);

      if (transactions.length > 0) {
        const firstTransaction = transactions[0];
        expect(firstTransaction).toBeInstanceOf(Transaction);
        expect(typeof firstTransaction?.externalId).toBe('string');
        expect(firstTransaction?.date).toBeInstanceOf(Date);
        expect(firstTransaction?.amount).toBeDefined();
        expect(typeof firstTransaction?.description).toBe('string');
        expect(firstTransaction?.type).toBeDefined();
        expect(firstTransaction?.accountId).toBe(account.externalId);
      }
    });

    test('should fetch transactions using account ID "0" for default account', async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const transactions = await gateway.getTransactions('0', from, to);

      expect(Array.isArray(transactions)).toBe(true);

      // Transactions are returned even if empty
      transactions.forEach((transaction) => {
        expect(transaction).toBeInstanceOf(Transaction);
        expect(transaction.accountId).toBe('0');
      });
    });

    test('should throw error for date range exceeding 31 days', () => {
      const to = new Date();
      const from = new Date(to.getTime() - 32 * 24 * 60 * 60 * 1000); // 32 days ago

      expect(() => gateway.getTransactions('0', from, to)).toThrow(
        'Date range cannot exceed 31 days and 1 hour',
      );
    });

    test('should throw error when start date is after end date', () => {
      const from = new Date();
      const to = new Date(from.getTime() - 24 * 60 * 60 * 1000); // 1 day before from

      expect(() => gateway.getTransactions('0', from, to)).toThrow(
        'Start date must be before end date',
      );
    });
  });

  describe('error handling', () => {
    test('should throw MonobankAuthError for invalid token', async () => {
      const invalidGateway = new MonobankGateway({
        token: 'invalid_token_12345',
      });

      await expect(invalidGateway.getAccounts()).rejects.toThrow(
        MonobankAuthError,
      );
    });
  });
});
