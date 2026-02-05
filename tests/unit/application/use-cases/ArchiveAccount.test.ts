import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ArchiveAccountUseCase } from '@application/use-cases/ArchiveAccount.ts';
import { Account } from '@domain/entities/Account.ts';
import { AccountNotFoundError } from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';

describe('ArchiveAccountUseCase', () => {
  let useCase: ArchiveAccountUseCase;
  let mockRepository: AccountRepository;
  let existingAccount: Account;

  beforeEach(() => {
    existingAccount = Account.create({
      externalId: 'acc-123',
      name: 'Test Account',
      currency: Currency.UAH,
      balance: Money.create(100000, Currency.UAH),
      type: 'debit',
      role: 'operational',
      source: 'manual',
      isArchived: false,
      dbId: 1,
    });

    const archivedAccount = existingAccount.archive();

    mockRepository = {
      findByDbId: mock((id: number) => {
        if (id === 1) {
          const calls = (mockRepository.update as ReturnType<typeof mock>).mock
            .calls;
          if (calls.length > 0) {
            return Promise.resolve(archivedAccount);
          }
          return Promise.resolve(existingAccount);
        }
        return Promise.resolve(null);
      }),
      update: mock(() => Promise.resolve()),
      findById: mock(() => Promise.resolve(null)),
      findByName: mock(() => Promise.resolve(null)),
      findAll: mock(() => Promise.resolve([])),
      findActive: mock(() => Promise.resolve([])),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByIban: mock(() => Promise.resolve(null)),
      findByBank: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      saveAndReturn: mock(() => Promise.resolve(existingAccount)),
      delete: mock(() => Promise.resolve()),
      updateLastSyncTime: mock(() => Promise.resolve()),
      updateBalance: mock(() => Promise.resolve()),
    } as unknown as AccountRepository;

    useCase = new ArchiveAccountUseCase(mockRepository);
  });

  test('should archive an account', async () => {
    const result = await useCase.execute({ id: 1 });

    expect(result.isArchived).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledTimes(1);
    expect(mockRepository.findByDbId).toHaveBeenCalledWith(1);
  });

  test('should call update with archived account', async () => {
    await useCase.execute({ id: 1 });

    const updateCalls = (mockRepository.update as ReturnType<typeof mock>).mock
      .calls;
    expect(updateCalls).toHaveLength(1);
    const updatedAccount = updateCalls[0]?.[0] as Account;

    expect(updatedAccount.isArchived).toBe(true);
    expect(updatedAccount.name).toBe('Test Account');
  });

  test('should throw AccountNotFoundError if account does not exist', async () => {
    await expect(useCase.execute({ id: 999 })).rejects.toThrow(
      AccountNotFoundError,
    );
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  test('should preserve all other account properties when archiving', async () => {
    const result = await useCase.execute({ id: 1 });

    expect(result.name).toBe('Test Account');
    expect(result.currency.code).toBe('UAH');
    expect(result.balance.amount).toBe(100000);
    expect(result.type).toBe('debit');
    expect(result.role).toBe('operational');
    expect(result.source).toBe('manual');
    expect(result.isArchived).toBe(true);
  });
});
