import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { SpreadsheetAccountNameResolver } from '@infrastructure/services/AccountNameResolver.ts';

describe('SpreadsheetAccountNameResolver', () => {
  let mockAccountRepository: AccountRepository;
  let resolver: SpreadsheetAccountNameResolver;

  const createAccount = (externalId: string, name: string): Account => {
    return Account.create({
      externalId,
      name,
      currency: Currency.UAH,
      balance: Money.create(100000, Currency.UAH),
    });
  };

  beforeEach(() => {
    mockAccountRepository = {
      findByExternalId: mock(() => Promise.resolve(null)),
      findByIban: mock(() => Promise.resolve(null)),
      findByBank: mock(() => Promise.resolve([])),
      updateLastSyncTime: mock(() => Promise.resolve()),
      findById: mock(() => Promise.resolve(null)),
      findAll: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveMany: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
    } as unknown as AccountRepository;

    resolver = new SpreadsheetAccountNameResolver(mockAccountRepository);
  });

  describe('getAccountName', () => {
    test('should return account name when found in repository', async () => {
      const account = createAccount('acc-123', 'Black Card *4530 (UAH)');
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(account),
      );

      const result = await resolver.getAccountName('acc-123');

      expect(result).toBe('Black Card *4530 (UAH)');
      expect(mockAccountRepository.findByExternalId).toHaveBeenCalledWith(
        'acc-123',
      );
    });

    test('should return accountId when account not found (fallback)', async () => {
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(null),
      );

      const result = await resolver.getAccountName('unknown-account-id');

      expect(result).toBe('unknown-account-id');
      expect(mockAccountRepository.findByExternalId).toHaveBeenCalledWith(
        'unknown-account-id',
      );
    });
  });

  describe('caching behavior', () => {
    test('should return cached value without calling repository on second call', async () => {
      const account = createAccount('acc-123', 'Black Card *4530 (UAH)');
      const findByExternalIdMock = mock(() => Promise.resolve(account));
      mockAccountRepository.findByExternalId = findByExternalIdMock;

      // First call
      const firstResult = await resolver.getAccountName('acc-123');
      expect(firstResult).toBe('Black Card *4530 (UAH)');
      expect(findByExternalIdMock).toHaveBeenCalledTimes(1);

      // Second call with same accountId
      const secondResult = await resolver.getAccountName('acc-123');
      expect(secondResult).toBe('Black Card *4530 (UAH)');
      expect(findByExternalIdMock).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    test('should make separate repository calls for different accountIds', async () => {
      const account1 = createAccount('acc-1', 'Card One');
      const account2 = createAccount('acc-2', 'Card Two');

      const findByExternalIdMock = mock((externalId: string) => {
        if (externalId === 'acc-1') {
          return Promise.resolve(account1);
        }
        if (externalId === 'acc-2') {
          return Promise.resolve(account2);
        }
        return Promise.resolve(null);
      });
      mockAccountRepository.findByExternalId = findByExternalIdMock;

      const result1 = await resolver.getAccountName('acc-1');
      const result2 = await resolver.getAccountName('acc-2');

      expect(result1).toBe('Card One');
      expect(result2).toBe('Card Two');
      expect(findByExternalIdMock).toHaveBeenCalledTimes(2);
    });

    test('should cache fallback values (accountId) for not found accounts', async () => {
      const findByExternalIdMock = mock(() => Promise.resolve(null));
      mockAccountRepository.findByExternalId = findByExternalIdMock;

      // First call - account not found
      const firstResult = await resolver.getAccountName('missing-account');
      expect(firstResult).toBe('missing-account');
      expect(findByExternalIdMock).toHaveBeenCalledTimes(1);

      // Second call - should use cached fallback value
      const secondResult = await resolver.getAccountName('missing-account');
      expect(secondResult).toBe('missing-account');
      expect(findByExternalIdMock).toHaveBeenCalledTimes(1); // Still 1
    });

    test('should cache both found names and fallback values independently', async () => {
      const foundAccount = createAccount('found-id', 'Found Account Name');

      const findByExternalIdMock = mock((externalId: string) => {
        if (externalId === 'found-id') {
          return Promise.resolve(foundAccount);
        }
        return Promise.resolve(null);
      });
      mockAccountRepository.findByExternalId = findByExternalIdMock;

      // Lookup found account
      const foundResult = await resolver.getAccountName('found-id');
      expect(foundResult).toBe('Found Account Name');

      // Lookup not found account
      const notFoundResult = await resolver.getAccountName('not-found-id');
      expect(notFoundResult).toBe('not-found-id');

      expect(findByExternalIdMock).toHaveBeenCalledTimes(2);

      // Both should be cached now - calling them again should not trigger repository calls
      await resolver.getAccountName('found-id');
      await resolver.getAccountName('not-found-id');

      expect(findByExternalIdMock).toHaveBeenCalledTimes(2); // Still 2
    });
  });
});
