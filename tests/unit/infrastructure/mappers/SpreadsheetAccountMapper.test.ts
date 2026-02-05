import { describe, expect, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import {
  type AccountRecord,
  SpreadsheetAccountMapper,
} from '@infrastructure/mappers/SpreadsheetAccountMapper.ts';

describe('SpreadsheetAccountMapper', () => {
  const mapper = new SpreadsheetAccountMapper();

  describe('toRecord', () => {
    test('should map Account entity to AccountRecord', () => {
      const account = Account.create({
        externalId: 'ext-123',
        name: 'Black Card *4530 (UAH)',
        currency: Currency.UAH,
        balance: Money.create(1000000, Currency.UAH), // 10000.00 UAH
        type: 'debit',
        iban: 'UA213223130000026201234567890',
        bank: 'monobank',
        lastSyncTime: 1704067200,
      });

      const record = mapper.toRecord(account);

      expect(record.name).toBe('Black Card *4530 (UAH)');
      expect(record.externalName).toBe('Black Card *4530 (UAH)');
      expect(record.type).toBe('Дебетова');
      expect(record.currency).toBe('UAH');
      expect(record.balance).toBe(10000); // Major units
      expect(record.creditLimit).toBe(0);
      expect(record.externalId).toBe('ext-123');
      expect(record.iban).toBe('UA213223130000026201234567890');
      expect(record.bank).toBe('monobank');
      expect(record.lastSyncTime).toBe(1704067200);
    });

    test('should preserve existing user name when provided', () => {
      const account = Account.create({
        externalId: 'ext-123',
        name: 'Black Card *4530 (UAH)',
        currency: Currency.UAH,
        balance: Money.create(500000, Currency.UAH),
        type: 'debit',
      });

      const record = mapper.toRecord(account, 'My Personal Card');

      expect(record.name).toBe('My Personal Card');
      expect(record.externalName).toBe('Black Card *4530 (UAH)');
    });

    test('should map credit card with credit limit', () => {
      const account = Account.create({
        externalId: 'credit-123',
        name: 'Iron Card *9999 (UAH)',
        currency: Currency.UAH,
        balance: Money.create(5000000, Currency.UAH), // 50000.00 UAH total
        creditLimit: Money.create(3000000, Currency.UAH), // 30000.00 UAH limit
        type: 'credit',
      });

      const record = mapper.toRecord(account);

      expect(record.type).toBe('Кредитка');
      expect(record.creditLimit).toBe(30000); // Major units
      // Actual balance = balance - creditLimit = 50000 - 30000 = 20000
      expect(record.balance).toBe(20000);
    });

    test('should map FOP account', () => {
      const account = Account.create({
        externalId: 'fop-123',
        name: 'FOP Account (UAH)',
        currency: Currency.UAH,
        balance: Money.create(10000000, Currency.UAH),
        type: 'fop',
      });

      const record = mapper.toRecord(account);

      expect(record.type).toBe('ФОП');
      expect(record.balance).toBe(100000);
    });

    test('should map debit account type to Дебетова', () => {
      const account = Account.create({
        externalId: 'debit-123',
        name: 'Debit Card',
        currency: Currency.UAH,
        balance: Money.create(100000, Currency.UAH),
        type: 'debit',
      });

      const record = mapper.toRecord(account);

      expect(record.type).toBe('Дебетова');
    });

    test('should handle USD currency', () => {
      const account = Account.create({
        externalId: 'usd-123',
        name: 'USD Card',
        currency: Currency.USD,
        balance: Money.create(50000, Currency.USD), // 500.00 USD
      });

      const record = mapper.toRecord(account);

      expect(record.currency).toBe('USD');
      expect(record.balance).toBe(500);
    });

    test('should handle negative balance (credit used)', () => {
      const account = Account.create({
        externalId: 'credit-neg',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance: Money.create(2500000, Currency.UAH), // 25000 balance
        creditLimit: Money.create(3000000, Currency.UAH), // 30000 limit
        type: 'credit',
      });

      const record = mapper.toRecord(account);

      // Actual balance = 25000 - 30000 = -5000
      expect(record.balance).toBe(-5000);
    });
  });

  describe('toEntity', () => {
    test('should map AccountRecord to Account entity', () => {
      const record: AccountRecord = {
        name: 'My Card',
        externalName: 'Black Card *4530 (UAH)',
        type: 'Дебетова',
        currency: 'UAH',
        balance: 10000, // Major units
        creditLimit: 0,
        externalId: 'ext-123',
        iban: 'UA213223130000026201234567890',
        bank: 'monobank',
        lastSyncTime: 1704067200,
      };

      const account = mapper.toEntity(record);

      expect(account.externalId).toBe('ext-123');
      expect(account.name).toBe('Black Card *4530 (UAH)');
      expect(account.currency.code).toBe('UAH');
      expect(account.balance.amount).toBe(1000000); // Minor units
      expect(account.type).toBe('debit');
      expect(account.iban).toBe('UA213223130000026201234567890');
      expect(account.bank).toBe('monobank');
      expect(account.lastSyncTime).toBe(1704067200);
    });

    test('should reconstruct credit card with credit limit', () => {
      const record: AccountRecord = {
        type: 'Кредитка',
        currency: 'UAH',
        balance: -5000, // Actual balance (negative = credit used)
        creditLimit: 30000,
        externalId: 'credit-123',
      };

      const account = mapper.toEntity(record);

      expect(account.type).toBe('credit');
      expect(account.creditLimit?.amount).toBe(3000000); // Minor units
      // Original balance = actual + creditLimit = -5000 + 30000 = 25000 in major units = 2500000 kopecks
      expect(account.balance.amount).toBe(2500000);
    });

    test('should map FOP account type', () => {
      const record: AccountRecord = {
        type: 'ФОП',
        currency: 'UAH',
        balance: 100000,
        creditLimit: 0,
        externalId: 'fop-123',
      };

      const account = mapper.toEntity(record);

      expect(account.type).toBe('fop');
    });

    test('should default to debit for Дебетова type', () => {
      const record: AccountRecord = {
        type: 'Дебетова',
        currency: 'UAH',
        balance: 5000,
        creditLimit: 0,
        externalId: 'debit-123',
      };

      const account = mapper.toEntity(record);

      expect(account.type).toBe('debit');
    });

    test('should fallback to name when externalName is not set', () => {
      const record: AccountRecord = {
        name: 'My Custom Name',
        type: 'Дебетова',
        currency: 'UAH',
        balance: 5000,
        creditLimit: 0,
        externalId: 'ext-123',
      };

      const account = mapper.toEntity(record);

      expect(account.name).toBe('My Custom Name');
    });

    test('should use externalId for account id', () => {
      const record: AccountRecord = {
        type: 'Дебетова',
        currency: 'UAH',
        balance: 5000,
        creditLimit: 0,
        externalId: 'ext-123',
      };

      const account = mapper.toEntity(record);

      expect(account.id).toBe('ext-123');
    });

    test('should fallback to name for id when externalId is missing', () => {
      const record: AccountRecord = {
        name: 'My Card',
        type: 'Дебетова',
        currency: 'UAH',
        balance: 5000,
        creditLimit: 0,
      };

      const account = mapper.toEntity(record);

      expect(account.id).toBe('My Card');
    });

    test('should handle zero credit limit as undefined', () => {
      const record: AccountRecord = {
        type: 'Дебетова',
        currency: 'UAH',
        balance: 5000,
        creditLimit: 0,
        externalId: 'ext-123',
      };

      const account = mapper.toEntity(record);

      expect(account.creditLimit).toBeUndefined();
    });

    test('should handle USD currency', () => {
      const record: AccountRecord = {
        type: 'Дебетова',
        currency: 'USD',
        balance: 500,
        creditLimit: 0,
        externalId: 'usd-123',
      };

      const account = mapper.toEntity(record);

      expect(account.currency.code).toBe('USD');
      expect(account.balance.amount).toBe(50000); // 500 * 100 kopecks
    });

    test('should handle EUR currency', () => {
      const record: AccountRecord = {
        type: 'Дебетова',
        currency: 'EUR',
        balance: 300,
        creditLimit: 0,
        externalId: 'eur-123',
      };

      const account = mapper.toEntity(record);

      expect(account.currency.code).toBe('EUR');
      expect(account.balance.amount).toBe(30000);
    });
  });

  describe('round trip conversion', () => {
    test('should preserve data through toRecord -> toEntity', () => {
      const original = Account.create({
        externalId: 'ext-123',
        name: 'Black Card *4530 (UAH)',
        currency: Currency.UAH,
        balance: Money.create(1000000, Currency.UAH),
        type: 'debit',
        iban: 'UA213223130000026201234567890',
        bank: 'monobank',
      });

      const record = mapper.toRecord(original);
      const restored = mapper.toEntity(record);

      expect(restored.externalId).toBe(original.externalId);
      expect(restored.name).toBe(original.name);
      expect(restored.currency.code).toBe(original.currency.code);
      expect(restored.balance.amount).toBe(original.balance.amount);
      expect(restored.iban).toBe(original.iban);
      expect(restored.bank).toBe(original.bank);
    });

    test('should preserve credit account data through round trip', () => {
      const original = Account.create({
        externalId: 'credit-123',
        name: 'Iron Card *9999 (UAH)',
        currency: Currency.UAH,
        balance: Money.create(5000000, Currency.UAH),
        creditLimit: Money.create(3000000, Currency.UAH),
        type: 'credit',
      });

      const record = mapper.toRecord(original);
      const restored = mapper.toEntity(record);

      expect(restored.balance.amount).toBe(original.balance.amount);
      expect(restored.creditLimit?.amount).toBe(original.creditLimit?.amount);
    });
  });
});
