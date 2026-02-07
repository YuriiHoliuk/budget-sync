import { describe, expect, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { DatabaseAccountMapper } from '@infrastructure/mappers/DatabaseAccountMapper.ts';
import type { AccountRow, NewAccountRow } from '@modules/database/types.ts';

describe('DatabaseAccountMapper', () => {
  const mapper = new DatabaseAccountMapper();

  describe('toEntity', () => {
    test('should convert DB row to Account entity', () => {
      const row: AccountRow = {
        id: 123,
        externalId: 'ext-123',
        name: 'My Account',
        externalName: 'External Name',
        type: 'debit',
        currency: 'UAH',
        balance: 50000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: 'UA123456789012345678901234',
        bank: 'Monobank',
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: new Date('2024-01-15T10:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account).toBeInstanceOf(Account);
      expect(account.externalId).toBe('ext-123');
      expect(account.name).toBe('External Name');
      expect(account.currency.code).toBe('UAH');
      expect(account.balance.amount).toBe(50000);
      expect(account.iban).toBe('UA123456789012345678901234');
      expect(account.bank).toBe('Monobank');
      expect(account.dbId).toBe(123);
    });

    test('should map DB debit type to debit type', () => {
      const row: AccountRow = {
        id: 1,
        externalId: 'ext-1',
        name: 'Debit Account',
        externalName: 'Debit Account',
        type: 'debit',
        currency: 'UAH',
        balance: 10000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.type).toBe('debit');
    });

    test('should map DB credit type to credit type', () => {
      const row: AccountRow = {
        id: 2,
        externalId: 'ext-2',
        name: 'Credit Account',
        externalName: 'Credit Account',
        type: 'credit',
        currency: 'UAH',
        balance: 30000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 30000,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.type).toBe('credit');
    });

    test('should map DB fop type to fop type', () => {
      const row: AccountRow = {
        id: 3,
        externalId: 'ext-3',
        name: 'FOP Account',
        externalName: 'FOP Account',
        type: 'fop',
        currency: 'UAH',
        balance: 100000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.type).toBe('fop');
    });

    test('should handle credit limit', () => {
      const row: AccountRow = {
        id: 4,
        externalId: 'ext-4',
        name: 'Credit Card',
        externalName: 'Credit Card',
        type: 'credit',
        currency: 'UAH',
        balance: 50000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 50000,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.creditLimit).toBeDefined();
      expect(account.creditLimit?.amount).toBe(50000);
      expect(account.creditLimit?.currency.code).toBe('UAH');
    });

    test('should handle zero credit limit as undefined', () => {
      const row: AccountRow = {
        id: 5,
        externalId: 'ext-5',
        name: 'Debit Card',
        externalName: 'Debit Card',
        type: 'debit',
        currency: 'UAH',
        balance: 10000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.creditLimit).toBeUndefined();
    });

    test('should convert lastSyncTime from Date to Unix timestamp', () => {
      const syncTime = new Date('2024-01-15T12:00:00Z');
      const row: AccountRow = {
        id: 6,
        externalId: 'ext-6',
        name: 'Account',
        externalName: 'Account',
        type: 'debit',
        currency: 'UAH',
        balance: 10000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: syncTime,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.lastSyncTime).toBe(syncTime.getTime());
    });

    test('should handle null lastSyncTime', () => {
      const row: AccountRow = {
        id: 7,
        externalId: 'ext-7',
        name: 'Account',
        externalName: 'Account',
        type: 'debit',
        currency: 'UAH',
        balance: 10000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.lastSyncTime).toBeUndefined();
    });

    test('should map initialBalance when present', () => {
      const row: AccountRow = {
        id: 8,
        externalId: 'ext-8',
        name: 'Account With Initial',
        externalName: 'Account With Initial',
        type: 'debit',
        currency: 'UAH',
        balance: 50000,
        initialBalance: 25000,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.initialBalance).toBeDefined();
      expect(account.initialBalance?.amount).toBe(25000);
      expect(account.initialBalance?.currency.code).toBe('UAH');
    });

    test('should handle null initialBalance as undefined', () => {
      const row: AccountRow = {
        id: 9,
        externalId: 'ext-9',
        name: 'Account Without Initial',
        externalName: 'Account Without Initial',
        type: 'debit',
        currency: 'UAH',
        balance: 50000,
        initialBalance: null,
        role: 'operational',
        creditLimit: 0,
        iban: null,
        bank: null,
        source: 'bank_sync',
        isArchived: false,
        lastSyncTime: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = mapper.toEntity(row);

      expect(account.initialBalance).toBeUndefined();
    });
  });

  describe('toInsert', () => {
    test('should convert Account to insert row', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-100',
        name: 'My Account',
        currency,
        balance: Money.create(75000, currency),
        iban: 'UA123456789012345678901234',
        bank: 'Monobank',
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.externalId).toBe('ext-100');
      expect(row.name).toBe('My Account');
      expect(row.externalName).toBe('My Account');
      expect(row.currency).toBe('UAH');
      expect(row.balance).toBe(75000);
      expect(row.iban).toBe('UA123456789012345678901234');
      expect(row.bank).toBe('Monobank');
      expect(row.role).toBe('operational');
    });

    test('should map debit account type to DB debit type', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-101',
        name: 'Debit Card',
        currency,
        balance: Money.create(10000, currency),
        type: 'debit',
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.type).toBe('debit');
    });

    test('should map credit account type to DB credit type', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-106',
        name: 'Credit Card',
        currency,
        balance: Money.create(30000, currency),
        creditLimit: Money.create(30000, currency),
        type: 'credit',
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.type).toBe('credit');
      expect(row.creditLimit).toBe(30000);
    });

    test('should map fop account type to DB fop type', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-107',
        name: 'FOP Account',
        currency,
        balance: Money.create(100000, currency),
        type: 'fop',
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.type).toBe('fop');
    });

    test('should default to debit type when account type is undefined', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-108',
        name: 'Unknown Type',
        currency,
        balance: Money.create(10000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.type).toBe('debit');
    });

    test('should set creditLimit to 0 when undefined', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-109',
        name: 'No Credit',
        currency,
        balance: Money.create(10000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.creditLimit).toBe(0);
    });

    test('should convert lastSyncTime from millisecond timestamp to Date', () => {
      const currency = Currency.UAH;
      const syncTimestamp = new Date('2024-01-15T12:00:00Z').getTime();
      const account = Account.create({
        externalId: 'ext-110',
        name: 'Synced Account',
        currency,
        balance: Money.create(10000, currency),
        lastSyncTime: syncTimestamp,
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.lastSyncTime).toBeInstanceOf(Date);
      expect(row.lastSyncTime?.getTime()).toBe(syncTimestamp);
    });

    test('should handle null lastSyncTime', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-111',
        name: 'Not Synced',
        currency,
        balance: Money.create(10000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.lastSyncTime).toBeNull();
    });

    test('should use existingName parameter when provided', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-112',
        name: 'New Name',
        currency,
        balance: Money.create(10000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account, 'Old Name');

      expect(row.name).toBe('Old Name');
      expect(row.externalName).toBe('New Name');
    });

    test('should use account name when existingName not provided', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-113',
        name: 'Account Name',
        currency,
        balance: Money.create(10000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.name).toBe('Account Name');
      expect(row.externalName).toBe('Account Name');
    });

    test('should map initialBalance when present', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-114',
        name: 'Account With Initial',
        currency,
        balance: Money.create(50000, currency),
        initialBalance: Money.create(25000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.initialBalance).toBe(25000);
    });

    test('should set initialBalance to null when undefined', () => {
      const currency = Currency.UAH;
      const account = Account.create({
        externalId: 'ext-115',
        name: 'Account Without Initial',
        currency,
        balance: Money.create(50000, currency),
      });

      const row: NewAccountRow = mapper.toInsert(account);

      expect(row.initialBalance).toBeNull();
    });
  });
});
