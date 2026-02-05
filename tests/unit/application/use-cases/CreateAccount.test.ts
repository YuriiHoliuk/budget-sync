import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CreateAccountUseCase } from '@application/use-cases/CreateAccount.ts';
import { AccountNameTakenError } from '@domain/errors/DomainErrors.ts';
import type { AccountRepository } from '@domain/repositories/AccountRepository.ts';
import { createTestAccount } from '../../helpers/fixtures.ts';

describe('CreateAccountUseCase', () => {
  let useCase: CreateAccountUseCase;
  let mockRepository: AccountRepository;

  beforeEach(() => {
    mockRepository = {
      findByName: mock(() => Promise.resolve(null)),
      saveAndReturn: mock((account) => Promise.resolve(account.withDbId(123))),
      findById: mock(() => Promise.resolve(null)),
      findByDbId: mock(() => Promise.resolve(null)),
      findAll: mock(() => Promise.resolve([])),
      findActive: mock(() => Promise.resolve([])),
      findByExternalId: mock(() => Promise.resolve(null)),
      findByIban: mock(() => Promise.resolve(null)),
      findByBank: mock(() => Promise.resolve([])),
      save: mock(() => Promise.resolve()),
      update: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
      updateLastSyncTime: mock(() => Promise.resolve()),
      updateBalance: mock(() => Promise.resolve()),
    } as unknown as AccountRepository;

    useCase = new CreateAccountUseCase(mockRepository);
  });

  test('should create a manual account with required fields', async () => {
    const request = {
      name: 'Cash',
      type: 'debit' as const,
      role: 'operational' as const,
      currency: 'UAH',
      balance: 50000, // 500 UAH in minor units
    };

    const result = await useCase.execute(request);

    expect(result.name).toBe('Cash');
    expect(result.type).toBe('debit');
    expect(result.role).toBe('operational');
    expect(result.currency.code).toBe('UAH');
    expect(result.balance.amount).toBe(50000);
    expect(result.source).toBe('manual');
    expect(result.isArchived).toBe(false);
    expect(result.dbId).toBe(123);
    expect(result.externalId).toMatch(/^manual-/);
    expect(mockRepository.saveAndReturn).toHaveBeenCalledTimes(1);
  });

  test('should create a credit account with credit limit', async () => {
    const request = {
      name: 'Credit Card',
      type: 'credit' as const,
      role: 'operational' as const,
      currency: 'UAH',
      balance: 0,
      creditLimit: 5000000, // 50,000 UAH credit limit
    };

    const result = await useCase.execute(request);

    expect(result.name).toBe('Credit Card');
    expect(result.type).toBe('credit');
    expect(result.creditLimit?.amount).toBe(5000000);
    expect(result.isCreditAccount).toBe(true);
  });

  test('should create account with IBAN', async () => {
    const request = {
      name: 'Savings Account',
      type: 'debit' as const,
      role: 'savings' as const,
      currency: 'USD',
      balance: 100000,
      iban: 'UA1234567890123456789012345',
    };

    const result = await useCase.execute(request);

    expect(result.iban).toBe('UA1234567890123456789012345');
    expect(result.role).toBe('savings');
    expect(result.currency.code).toBe('USD');
  });

  test('should throw AccountNameTakenError if name already exists', async () => {
    const existingAccount = createTestAccount({ name: 'Cash' });
    (
      mockRepository.findByName as ReturnType<typeof mock>
    ).mockResolvedValueOnce(existingAccount);

    const request = {
      name: 'Cash',
      type: 'debit' as const,
      role: 'operational' as const,
      currency: 'UAH',
      balance: 0,
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      AccountNameTakenError,
    );
    expect(mockRepository.saveAndReturn).not.toHaveBeenCalled();
  });

  test('should not set credit limit if zero or negative', async () => {
    const request = {
      name: 'Debit Card',
      type: 'debit' as const,
      role: 'operational' as const,
      currency: 'UAH',
      balance: 10000,
      creditLimit: 0,
    };

    const result = await useCase.execute(request);

    expect(result.creditLimit).toBeUndefined();
    expect(result.isCreditAccount).toBe(false);
  });

  test('should create FOP account', async () => {
    const request = {
      name: 'FOP Account',
      type: 'fop' as const,
      role: 'operational' as const,
      currency: 'UAH',
      balance: 250000,
    };

    const result = await useCase.execute(request);

    expect(result.type).toBe('fop');
  });
});
