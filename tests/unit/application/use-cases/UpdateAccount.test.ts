import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { UpdateAccountUseCase } from '@application/use-cases/UpdateAccount.ts';
import { Account } from '@domain/entities/Account.ts';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  ProtectedFieldUpdateError,
} from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { createTestAccount } from '../../helpers/fixtures.ts';

describe('UpdateAccountUseCase', () => {
  let useCase: UpdateAccountUseCase;
  let mockRepository: AccountRepository;
  let manualAccount: Account;
  let syncedAccount: Account;
  let lastUpdatedAccount: Account | null;

  beforeEach(() => {
    lastUpdatedAccount = null;

    manualAccount = Account.create({
      externalId: 'manual-123',
      name: 'Cash Account',
      currency: Currency.UAH,
      balance: Money.create(100000, Currency.UAH),
      type: 'debit',
      role: 'operational',
      source: 'manual',
      isArchived: false,
      dbId: 1,
    });

    syncedAccount = Account.create({
      externalId: 'mono-456',
      name: 'Monobank Black',
      currency: Currency.UAH,
      balance: Money.create(500000, Currency.UAH),
      type: 'debit',
      role: 'operational',
      iban: 'UA123456789012345678901234567',
      bank: 'monobank',
      source: 'bank_sync',
      isArchived: false,
      dbId: 2,
    });

    mockRepository = {
      findByDbId: mock((id: number) => {
        if (lastUpdatedAccount?.dbId === id) {
          return Promise.resolve(lastUpdatedAccount);
        }
        if (id === 1) {
          return Promise.resolve(manualAccount);
        }
        if (id === 2) {
          return Promise.resolve(syncedAccount);
        }
        return Promise.resolve(null);
      }),
      findByName: mock(() => Promise.resolve(null)),
      update: mock((account: Account) => {
        lastUpdatedAccount = account;
        return Promise.resolve();
      }),
      findById: mock(() => Promise.resolve(null)),
      findAll: mock(() => Promise.resolve([])),
      findActive: mock(() => Promise.resolve([])),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByIban: mock(() => Promise.resolve(null)),
      findByBank: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveAndReturn: mock(() => Promise.resolve(manualAccount)),
      delete: mock(() => Promise.resolve()),
      updateLastSyncTime: mock(() => Promise.resolve()),
      updateBalance: mock(() => Promise.resolve()),
    } as unknown as AccountRepository;

    useCase = new UpdateAccountUseCase(mockRepository);
  });

  describe('Manual account updates', () => {
    test('should update name of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        name: 'Updated Cash Account',
      });

      expect(result.name).toBe('Updated Cash Account');
      expect(mockRepository.update).toHaveBeenCalledTimes(1);
    });

    test('should update type of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        type: 'credit',
      });

      expect(result.type).toBe('credit');
    });

    test('should update role of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        role: 'savings',
      });

      expect(result.role).toBe('savings');
    });

    test('should update currency of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        currency: 'USD',
      });

      expect(result.currency.code).toBe('USD');
    });

    test('should update balance of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        balance: 200000,
      });

      expect(result.balance.amount).toBe(200000);
    });

    test('should update iban of manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        iban: 'UA999888777666555444333222111',
      });

      expect(result.iban).toBe('UA999888777666555444333222111');
    });

    test('should add credit limit to manual account', async () => {
      const result = await useCase.execute({
        id: 1,
        creditLimit: 1000000,
      });

      expect(result.creditLimit?.amount).toBe(1000000);
    });

    test('should remove credit limit when set to null', async () => {
      const accountWithCreditLimit = manualAccount.withUpdatedProps({
        creditLimit: Money.create(500000, Currency.UAH),
      });

      mockRepository.findByDbId = mock((id: number) => {
        if (lastUpdatedAccount?.dbId === id) {
          return Promise.resolve(lastUpdatedAccount);
        }
        if (id === 1) {
          return Promise.resolve(accountWithCreditLimit);
        }
        return Promise.resolve(null);
      });

      const result = await useCase.execute({
        id: 1,
        creditLimit: null,
      });

      expect(result.creditLimit).toBeUndefined();
    });
  });

  describe('Synced account updates', () => {
    test('should allow updating name of synced account', async () => {
      const result = await useCase.execute({
        id: 2,
        name: 'My Black Card',
      });

      expect(result.name).toBe('My Black Card');
    });

    test('should allow updating role of synced account', async () => {
      const result = await useCase.execute({
        id: 2,
        role: 'savings',
      });

      expect(result.role).toBe('savings');
    });

    test('should throw ProtectedFieldUpdateError when updating IBAN of synced account', async () => {
      const request = {
        id: 2,
        iban: 'UA000000000000000000000000000',
      };

      await expect(useCase.execute(request)).rejects.toThrow(
        ProtectedFieldUpdateError,
      );
    });

    test('should throw ProtectedFieldUpdateError when updating currency of synced account', async () => {
      const request = {
        id: 2,
        currency: 'USD',
      };

      await expect(useCase.execute(request)).rejects.toThrow(
        ProtectedFieldUpdateError,
      );
    });

    test('should allow same IBAN value (no actual change)', async () => {
      const result = await useCase.execute({
        id: 2,
        iban: 'UA123456789012345678901234567',
      });

      expect(result.iban).toBe('UA123456789012345678901234567');
    });

    test('should allow same currency value (no actual change)', async () => {
      const result = await useCase.execute({
        id: 2,
        currency: 'UAH',
      });

      expect(result.currency.code).toBe('UAH');
    });
  });

  describe('Error handling', () => {
    test('should throw AccountNotFoundError if account does not exist', async () => {
      const request = {
        id: 999,
        name: 'Non-existent',
      };

      await expect(useCase.execute(request)).rejects.toThrow(
        AccountNotFoundError,
      );
    });

    test('should throw AccountNameTakenError if new name is taken', async () => {
      const otherAccount = createTestAccount({ name: 'Taken Name', dbId: 99 });
      (
        mockRepository.findByName as ReturnType<typeof mock>
      ).mockResolvedValueOnce(otherAccount);

      const request = {
        id: 1,
        name: 'Taken Name',
      };

      await expect(useCase.execute(request)).rejects.toThrow(
        AccountNameTakenError,
      );
    });

    test('should allow keeping the same name (not a conflict)', async () => {
      (
        mockRepository.findByName as ReturnType<typeof mock>
      ).mockResolvedValueOnce(manualAccount);

      const result = await useCase.execute({
        id: 1,
        name: 'Cash Account',
      });

      expect(result.name).toBe('Cash Account');
    });
  });
});
