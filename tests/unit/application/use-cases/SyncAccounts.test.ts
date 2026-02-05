import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { SyncAccountsUseCase } from '@application/use-cases/SyncAccounts.ts';
import type { BankGateway } from '@domain/gateways/BankGateway.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';
import {
  createMockAccountRepository,
  createMockBankGateway,
  createTestAccount,
} from '../../helpers';

describe('SyncAccountsUseCase', () => {
  let mockBankGateway: BankGateway;
  let mockAccountRepository: AccountRepository;
  let useCase: SyncAccountsUseCase;

  // Alias for backward compatibility within tests
  const createAccount = createTestAccount;

  beforeEach(() => {
    mockBankGateway = createMockBankGateway();
    mockAccountRepository = createMockAccountRepository();
    useCase = new SyncAccountsUseCase(mockBankGateway, mockAccountRepository);
  });

  describe('execute', () => {
    test('should return result with created/updated/unchanged counts', async () => {
      const result = await useCase.execute();

      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('unchanged');
      expect(result).toHaveProperty('errors');
      expect(typeof result.created).toBe('number');
      expect(typeof result.updated).toBe('number');
      expect(typeof result.unchanged).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('should return zero counts when no accounts from bank', async () => {
      mockBankGateway.getAccounts = mock(() => Promise.resolve([]));

      const result = await useCase.execute();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should create new account when not found by externalId or iban', async () => {
      const newAccount = createAccount({ externalId: 'new-acc-456' });
      mockBankGateway.getAccounts = mock(() => Promise.resolve([newAccount]));
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(null),
      );
      mockAccountRepository.findByIban = mock(() => Promise.resolve(null));

      const result = await useCase.execute();

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(mockAccountRepository.save).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.save).toHaveBeenCalledWith(newAccount);
    });

    test('should update account when found and has changes', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(50000, Currency.UAH),
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(100000, Currency.UAH),
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(0);
      expect(mockAccountRepository.update).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.update).toHaveBeenCalledWith(
        incomingAccount,
      );
    });

    test('should skip update when account unchanged', async () => {
      const existingAccount = createAccount({ externalId: 'acc-123' });
      const incomingAccount = createAccount({ externalId: 'acc-123' });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(1);
      expect(mockAccountRepository.update).not.toHaveBeenCalled();
      expect(mockAccountRepository.save).not.toHaveBeenCalled();
    });

    test('should find existing account by externalId first', async () => {
      const existingAccount = createAccount({ externalId: 'acc-123' });
      const incomingAccount = createAccount({ externalId: 'acc-123' });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      await useCase.execute();

      expect(mockAccountRepository.findByExternalId).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.findByExternalId).toHaveBeenCalledWith(
        'acc-123',
      );
      expect(mockAccountRepository.findByIban).not.toHaveBeenCalled();
    });

    test('should find existing account by iban when not found by externalId', async () => {
      const existingAccount = createAccount({
        externalId: 'old-external-id',
        iban: 'UA123456789012345678901234567',
      });
      const incomingAccount = createAccount({
        externalId: 'new-external-id',
        iban: 'UA123456789012345678901234567',
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(null),
      );
      mockAccountRepository.findByIban = mock(() =>
        Promise.resolve(existingAccount),
      );

      await useCase.execute();

      expect(mockAccountRepository.findByExternalId).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.findByIban).toHaveBeenCalledTimes(1);
      expect(mockAccountRepository.findByIban).toHaveBeenCalledWith(
        'UA123456789012345678901234567',
      );
    });

    test('should not search by iban when iban is not present', async () => {
      const incomingAccount = createAccount({
        externalId: 'acc-no-iban',
        iban: undefined,
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(null),
      );

      await useCase.execute();

      expect(mockAccountRepository.findByIban).not.toHaveBeenCalled();
      expect(mockAccountRepository.save).toHaveBeenCalledTimes(1);
    });

    test('should process multiple accounts correctly', async () => {
      const existingAccount = createAccount({
        externalId: 'existing-acc',
        balance: Money.create(50000, Currency.UAH),
      });
      const incomingExisting = createAccount({
        externalId: 'existing-acc',
        balance: Money.create(100000, Currency.UAH),
      });
      const incomingNew = createAccount({ externalId: 'new-acc' });
      const incomingUnchanged = createAccount({
        externalId: 'unchanged-acc',
        balance: Money.create(75000, Currency.UAH),
      });
      const existingUnchanged = createAccount({
        externalId: 'unchanged-acc',
        balance: Money.create(75000, Currency.UAH),
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingExisting, incomingNew, incomingUnchanged]),
      );
      mockAccountRepository.findByExternalId = mock((externalId: string) => {
        if (externalId === 'existing-acc') {
          return Promise.resolve(existingAccount);
        }
        if (externalId === 'unchanged-acc') {
          return Promise.resolve(existingUnchanged);
        }
        return Promise.resolve(null);
      });

      const result = await useCase.execute();

      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.unchanged).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('hasAccountChanged', () => {
    test('should detect balance change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(50000, Currency.UAH),
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(100000, Currency.UAH),
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect balance currency change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(100000, Currency.UAH),
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        balance: Money.create(100000, Currency.USD),
        currency: Currency.USD,
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect name change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        name: 'Old Name',
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        name: 'New Name',
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect type change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        type: 'debit',
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        type: 'credit',
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect iban change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        iban: 'UA111111111111111111111111111',
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        iban: 'UA222222222222222222222222222',
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect iban added', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        iban: undefined,
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        iban: 'UA123456789012345678901234567',
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect maskedPan length change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234'],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234', '*5678'],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect maskedPan values change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234', '*5678'],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234', '*9999'],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect maskedPan added when previously undefined', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234'],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should detect maskedPan removed', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: ['*1234'],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(1);
    });

    test('should not detect change when both maskedPan are undefined', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
    });

    test('should not detect change when all properties are identical', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        name: 'Main Card',
        balance: Money.create(100000, Currency.UAH),
        type: 'debit',
        iban: 'UA123456789012345678901234567',
        maskedPan: ['*1234', '*5678'],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        name: 'Main Card',
        balance: Money.create(100000, Currency.UAH),
        type: 'debit',
        iban: 'UA123456789012345678901234567',
        maskedPan: ['*1234', '*5678'],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle gateway fetch error and return error message', async () => {
      mockBankGateway.getAccounts = mock(() =>
        Promise.reject(new Error('API rate limit exceeded')),
      );

      const result = await useCase.execute();

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to fetch accounts from bank: API rate limit exceeded',
      );
    });

    test('should handle gateway fetch error with non-Error object', async () => {
      mockBankGateway.getAccounts = mock(() => Promise.reject('String error'));

      const result = await useCase.execute();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to fetch accounts from bank: Unknown error',
      );
    });

    test('should handle individual account processing error', async () => {
      const account1 = createAccount({ externalId: 'acc-1' });
      const account2 = createAccount({ externalId: 'acc-2' });
      const account3 = createAccount({ externalId: 'acc-3' });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([account1, account2, account3]),
      );
      mockAccountRepository.findByExternalId = mock((externalId: string) => {
        if (externalId === 'acc-2') {
          return Promise.reject(new Error('Database connection failed'));
        }
        return Promise.resolve(null);
      });

      const result = await useCase.execute();

      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to process account acc-2: Database connection failed',
      );
    });

    test('should continue processing remaining accounts after error', async () => {
      const account1 = createAccount({ externalId: 'acc-1' });
      const account2 = createAccount({ externalId: 'acc-2' });
      const account3 = createAccount({ externalId: 'acc-3' });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([account1, account2, account3]),
      );
      mockAccountRepository.findByExternalId = mock((externalId: string) => {
        if (externalId === 'acc-1') {
          return Promise.reject(new Error('Error 1'));
        }
        if (externalId === 'acc-2') {
          return Promise.reject(new Error('Error 2'));
        }
        return Promise.resolve(null);
      });

      const result = await useCase.execute();

      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain(
        'Failed to process account acc-1: Error 1',
      );
      expect(result.errors).toContain(
        'Failed to process account acc-2: Error 2',
      );
    });

    test('should handle save error', async () => {
      const newAccount = createAccount({ externalId: 'new-acc' });

      mockBankGateway.getAccounts = mock(() => Promise.resolve([newAccount]));
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(null),
      );
      mockAccountRepository.findByIban = mock(() => Promise.resolve(null));
      mockAccountRepository.save = mock(() =>
        Promise.reject(new Error('Save failed')),
      );

      const result = await useCase.execute();

      expect(result.created).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to process account new-acc: Save failed',
      );
    });

    test('should handle update error', async () => {
      const existingAccount = createAccount({
        externalId: 'existing-acc',
        balance: Money.create(50000, Currency.UAH),
      });
      const incomingAccount = createAccount({
        externalId: 'existing-acc',
        balance: Money.create(100000, Currency.UAH),
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );
      mockAccountRepository.update = mock(() =>
        Promise.reject(new Error('Update failed')),
      );

      const result = await useCase.execute();

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to process account existing-acc: Update failed',
      );
    });

    test('should handle non-Error object in individual account processing', async () => {
      const account = createAccount({ externalId: 'acc-1' });

      mockBankGateway.getAccounts = mock(() => Promise.resolve([account]));
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.reject({ code: 'UNKNOWN' }),
      );

      const result = await useCase.execute();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Failed to process account acc-1: Unknown error',
      );
    });
  });

  describe('edge cases', () => {
    test('should handle empty maskedPan array as no change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: [],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: [],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
    });

    test('should handle transition from empty array to undefined as change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: [],
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      // Both empty array and undefined become [], so no length difference
      expect(result.unchanged).toBe(1);
    });

    test('should handle transition from undefined to empty array as no change', async () => {
      const existingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: undefined,
      });
      const incomingAccount = createAccount({
        externalId: 'acc-123',
        maskedPan: [],
      });

      mockBankGateway.getAccounts = mock(() =>
        Promise.resolve([incomingAccount]),
      );
      mockAccountRepository.findByExternalId = mock(() =>
        Promise.resolve(existingAccount),
      );

      const result = await useCase.execute();

      // Both undefined and empty array become [], so no length difference
      expect(result.unchanged).toBe(1);
    });
  });
});
