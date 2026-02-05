import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  MonobankApiError,
  MonobankAuthError,
  MonobankRateLimitError,
} from '@infrastructure/gateways/monobank/errors.ts';
import { MonobankGateway } from '@infrastructure/gateways/monobank/MonobankGateway.ts';
import type {
  MonobankClientInfo,
  MonobankStatementItem,
} from '@infrastructure/gateways/monobank/types.ts';

describe('MonobankGateway', () => {
  const testToken = 'test-monobank-token';
  let originalFetch: typeof globalThis.fetch;
  let lastFetchUrl: string | undefined;
  let lastFetchOptions: RequestInit | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastFetchUrl = undefined;
    lastFetchOptions = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createMockResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function setupMockFetch(response: Response): void {
    const mockFn = mock((url: string | URL | Request, init?: RequestInit) => {
      lastFetchUrl = url.toString();
      lastFetchOptions = init;
      return Promise.resolve(response);
    });
    // Use type assertion to bypass the preconnect property check
    globalThis.fetch = mockFn as unknown as typeof fetch;
  }

  function createMockClientInfo(): MonobankClientInfo {
    return {
      clientId: 'client-123',
      name: 'Test User',
      permissions: 'psfj',
      accounts: [
        {
          id: 'account-123',
          sendId: 'send-123',
          balance: 1000000,
          creditLimit: 0,
          type: 'black',
          currencyCode: 980,
          maskedPan: ['**** **** **** 1234'],
          iban: 'UA213223130000026201234567890',
        },
      ],
      jars: [],
    };
  }

  function createMockStatementItems(): MonobankStatementItem[] {
    return [
      {
        id: 'tx-123',
        time: 1704067200,
        description: 'ATB Market',
        mcc: 5411,
        originalMcc: 5411,
        hold: false,
        amount: -15000,
        operationAmount: -15000,
        currencyCode: 980,
        commissionRate: 0,
        cashbackAmount: 150,
        balance: 985000,
      },
    ];
  }

  describe('getAccounts', () => {
    test('should call correct endpoint with token header', async () => {
      setupMockFetch(createMockResponse(createMockClientInfo()));

      const gateway = new MonobankGateway({ token: testToken });
      await gateway.getAccounts();

      expect(lastFetchUrl).toBe('https://api.monobank.ua/personal/client-info');
      expect(lastFetchOptions?.method).toBe('GET');
      expect(lastFetchOptions?.headers).toEqual({
        'X-Token': testToken,
        'Content-Type': 'application/json',
      });
    });

    test('should return mapped Account entities', async () => {
      setupMockFetch(createMockResponse(createMockClientInfo()));

      const gateway = new MonobankGateway({ token: testToken });
      const accounts = await gateway.getAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toBeDefined();
      expect(accounts[0]?.externalId).toBe('account-123');
      expect(accounts[0]?.currency.code).toBe('UAH');
      expect(accounts[0]?.balance.amount).toBe(1000000);
      expect(accounts[0]?.type).toBe('debit');
      expect(accounts[0]?.bank).toBe('monobank');
    });
  });

  describe('getTransactions', () => {
    test('should call correct endpoint with accountId and date timestamps', async () => {
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({ token: testToken });
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-15T00:00:00Z');

      await gateway.getTransactions('account-123', from, to);

      const fromTimestamp = Math.floor(from.getTime() / 1000);
      const toTimestamp = Math.floor(to.getTime() / 1000);
      expect(lastFetchUrl).toBe(
        `https://api.monobank.ua/personal/statement/account-123/${fromTimestamp}/${toTimestamp}`,
      );
      expect(lastFetchOptions?.headers).toEqual({
        'X-Token': testToken,
        'Content-Type': 'application/json',
      });
    });

    test('should return mapped Transaction entities', async () => {
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({ token: testToken });
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-15T00:00:00Z');

      const transactions = await gateway.getTransactions(
        'account-123',
        from,
        to,
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toBeDefined();
      expect(transactions[0]?.externalId).toBe('tx-123');
      expect(transactions[0]?.description).toBe('ATB Market');
      expect(transactions[0]?.amount.amount).toBe(-15000);
      expect(transactions[0]?.accountId).toBe('account-123');
      expect(transactions[0]?.mcc).toBe(5411);
    });
  });

  describe('validateDateRange', () => {
    test('should throw when from > to', async () => {
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({ token: testToken });
      const from = new Date('2024-01-15T00:00:00Z');
      const to = new Date('2024-01-01T00:00:00Z');

      await expect(
        gateway.getTransactions('account-123', from, to),
      ).rejects.toThrow('Start date must be before end date');
    });

    test('should throw when range exceeds 31 days + 1 hour', async () => {
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({ token: testToken });
      const from = new Date('2024-01-01T00:00:00Z');
      // 32 days later - exceeds the 31 days + 1 hour limit
      const to = new Date('2024-02-02T00:00:00Z');

      await expect(
        gateway.getTransactions('account-123', from, to),
      ).rejects.toThrow('Date range cannot exceed 31 days and 1 hour');
    });

    test('should allow exactly 31 days + 1 hour range', async () => {
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({ token: testToken });
      const from = new Date('2024-01-01T00:00:00Z');
      // Exactly 31 days + 1 hour
      const to = new Date(
        from.getTime() + 31 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
      );

      await expect(
        gateway.getTransactions('account-123', from, to),
      ).resolves.toBeDefined();
    });
  });

  describe('error handling', () => {
    test('should throw MonobankAuthError on 401 response', async () => {
      setupMockFetch(
        createMockResponse({ errorDescription: 'Invalid token' }, 401),
      );

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankAuthError);
        expect((error as MonobankAuthError).message).toBe('Invalid token');
        expect((error as MonobankAuthError).statusCode).toBe(401);
      }
    });

    test('should throw MonobankAuthError on 403 response', async () => {
      setupMockFetch(
        createMockResponse({ errorDescription: 'Access denied' }, 403),
      );

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankAuthError);
        expect((error as MonobankAuthError).message).toBe('Access denied');
      }
    });

    test('should throw MonobankRateLimitError on 429 response', async () => {
      setupMockFetch(
        createMockResponse({ errorDescription: 'Too many requests' }, 429),
      );

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankRateLimitError);
        expect((error as MonobankRateLimitError).message).toBe(
          'Too many requests',
        );
        expect((error as MonobankRateLimitError).statusCode).toBe(429);
      }
    });

    test('should throw MonobankApiError with status code for other errors', async () => {
      setupMockFetch(
        createMockResponse({ errorDescription: 'Server error' }, 500),
      );

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankApiError);
        expect((error as MonobankApiError).message).toBe('Server error');
        expect((error as MonobankApiError).statusCode).toBe(500);
        expect((error as MonobankApiError).errorDescription).toBe(
          'Server error',
        );
      }
    });

    test('should handle error response without JSON body', async () => {
      const mockFn = mock(() =>
        Promise.resolve(
          new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          }),
        ),
      );
      globalThis.fetch = mockFn as unknown as typeof fetch;

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankApiError);
        expect((error as MonobankApiError).message).toBe(
          'Monobank API error: 500',
        );
        expect((error as MonobankApiError).statusCode).toBe(500);
      }
    });

    test('should throw MonobankApiError on 404 response', async () => {
      setupMockFetch(
        createMockResponse({ errorDescription: 'Account not found' }, 404),
      );

      const gateway = new MonobankGateway({ token: testToken });

      try {
        await gateway.getAccounts();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MonobankApiError);
        expect((error as MonobankApiError).statusCode).toBe(404);
      }
    });
  });

  describe('custom baseUrl', () => {
    test('should use custom baseUrl when provided in config', async () => {
      const customBaseUrl = 'https://custom-monobank-api.example.com';
      setupMockFetch(createMockResponse(createMockClientInfo()));

      const gateway = new MonobankGateway({
        token: testToken,
        baseUrl: customBaseUrl,
      });
      await gateway.getAccounts();

      expect(lastFetchUrl).toBe(`${customBaseUrl}/personal/client-info`);
    });

    test('should use custom baseUrl for transactions endpoint', async () => {
      const customBaseUrl = 'https://custom-monobank-api.example.com';
      setupMockFetch(createMockResponse(createMockStatementItems()));

      const gateway = new MonobankGateway({
        token: testToken,
        baseUrl: customBaseUrl,
      });
      const from = new Date('2024-01-01T00:00:00Z');
      const to = new Date('2024-01-15T00:00:00Z');

      await gateway.getTransactions('account-123', from, to);

      expect(lastFetchUrl).toContain(customBaseUrl);
      expect(lastFetchUrl).toContain('/personal/statement/account-123/');
    });

    test('should use default baseUrl when not provided', async () => {
      setupMockFetch(createMockResponse(createMockClientInfo()));

      const gateway = new MonobankGateway({ token: testToken });
      await gateway.getAccounts();

      expect(lastFetchUrl).toStartWith('https://api.monobank.ua');
    });
  });
});
