import { describe, expect, test } from 'bun:test';
import { Account } from '@domain/entities/Account.ts';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';

describe('Account', () => {
  describe('create', () => {
    test('should create account with all required props', () => {
      const currency = Currency.UAH;
      const balance = Money.create(100000, currency);

      const account = Account.create({
        externalId: 'ext-123',
        name: 'Main Account',
        currency,
        balance,
      });

      expect(account.externalId).toBe('ext-123');
      expect(account.name).toBe('Main Account');
      expect(account.currency.equals(currency)).toBe(true);
      expect(account.balance.equals(balance)).toBe(true);
    });

    test('should use externalId as id when id not provided', () => {
      const account = Account.create({
        externalId: 'ext-456',
        name: 'Test Account',
        currency: Currency.UAH,
        balance: Money.create(50000, Currency.UAH),
      });

      expect(account.id).toBe('ext-456');
    });

    test('should use provided id when given', () => {
      const account = Account.create(
        {
          externalId: 'ext-789',
          name: 'Test Account',
          currency: Currency.USD,
          balance: Money.create(10000, Currency.USD),
        },
        'custom-id-123',
      );

      expect(account.id).toBe('custom-id-123');
      expect(account.externalId).toBe('ext-789');
    });
  });

  describe('getters', () => {
    test('should return externalId', () => {
      const account = Account.create({
        externalId: 'mono-account-123',
        name: 'Monobank',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.externalId).toBe('mono-account-123');
    });

    test('should return name', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Savings Account',
        currency: Currency.EUR,
        balance: Money.create(500000, Currency.EUR),
      });

      expect(account.name).toBe('Savings Account');
    });

    test('should return currency', () => {
      const currency = Currency.USD;
      const account = Account.create({
        externalId: 'ext-1',
        name: 'USD Account',
        currency,
        balance: Money.create(100000, currency),
      });

      expect(account.currency.equals(Currency.USD)).toBe(true);
    });

    test('should return balance', () => {
      const balance = Money.create(250000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance,
      });

      expect(account.balance.equals(balance)).toBe(true);
    });

    test('should return type when provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Card',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
        type: 'debit',
      });

      expect(account.type).toBe('debit');
    });

    test('should return iban when provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
        iban: 'UA213223130000026201234567890',
      });

      expect(account.iban).toBe('UA213223130000026201234567890');
    });

    test('should return maskedPan when provided', () => {
      const maskedPans = ['5375****1234', '5375****5678'];
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Card',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
        maskedPan: maskedPans,
      });

      expect(account.maskedPan).toEqual(maskedPans);
    });

    test('should return creditLimit when provided', () => {
      const creditLimit = Money.create(5000000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance: Money.create(5000000, Currency.UAH),
        creditLimit,
      });

      expect(account.creditLimit?.equals(creditLimit)).toBe(true);
    });

    test('should return bank when provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
        bank: 'monobank',
      });

      expect(account.bank).toBe('monobank');
    });

    test('should return lastSyncTime when provided', () => {
      const syncTime = 1704067200;
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
        lastSyncTime: syncTime,
      });

      expect(account.lastSyncTime).toBe(syncTime);
    });
  });

  describe('optional properties', () => {
    test('should return debit as default type when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.type).toBe('debit');
    });

    test('should return undefined for iban when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.iban).toBeUndefined();
    });

    test('should return undefined for maskedPan when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.maskedPan).toBeUndefined();
    });

    test('should return undefined for creditLimit when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.creditLimit).toBeUndefined();
    });

    test('should return undefined for bank when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.bank).toBeUndefined();
    });

    test('should return undefined for lastSyncTime when not provided', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Main',
        currency: Currency.UAH,
        balance: Money.create(0, Currency.UAH),
      });

      expect(account.lastSyncTime).toBeUndefined();
    });
  });

  describe('isCreditAccount', () => {
    test('should return true when creditLimit is greater than 0', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance: Money.create(5000000, Currency.UAH),
        creditLimit: Money.create(5000000, Currency.UAH),
      });

      expect(account.isCreditAccount).toBe(true);
    });

    test('should return false when creditLimit is undefined', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Debit Card',
        currency: Currency.UAH,
        balance: Money.create(100000, Currency.UAH),
      });

      expect(account.isCreditAccount).toBe(false);
    });

    test('should return false when creditLimit is 0', () => {
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Debit Card',
        currency: Currency.UAH,
        balance: Money.create(100000, Currency.UAH),
        creditLimit: Money.create(0, Currency.UAH),
      });

      expect(account.isCreditAccount).toBe(false);
    });
  });

  describe('actualBalance', () => {
    test('should return regular balance for non-credit accounts', () => {
      const balance = Money.create(150000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Debit Card',
        currency: Currency.UAH,
        balance,
      });

      expect(account.actualBalance.equals(balance)).toBe(true);
    });

    test('should return regular balance when creditLimit is 0', () => {
      const balance = Money.create(150000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Debit Card',
        currency: Currency.UAH,
        balance,
        creditLimit: Money.create(0, Currency.UAH),
      });

      expect(account.actualBalance.equals(balance)).toBe(true);
    });

    test('should return balance minus creditLimit for credit accounts', () => {
      const balance = Money.create(3000000, Currency.UAH);
      const creditLimit = Money.create(5000000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance,
        creditLimit,
      });

      const expectedActualBalance = Money.create(-2000000, Currency.UAH);
      expect(account.actualBalance.equals(expectedActualBalance)).toBe(true);
    });

    test('should show negative balance when credit is used', () => {
      const balance = Money.create(2000000, Currency.UAH);
      const creditLimit = Money.create(5000000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance,
        creditLimit,
      });

      expect(account.actualBalance.isNegative()).toBe(true);
      expect(account.actualBalance.amount).toBe(-3000000);
    });

    test('should show zero balance when credit is fully repaid', () => {
      const creditLimit = Money.create(5000000, Currency.UAH);
      const balance = Money.create(5000000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance,
        creditLimit,
      });

      expect(account.actualBalance.isZero()).toBe(true);
    });

    test('should show positive balance when overpaid on credit account', () => {
      const creditLimit = Money.create(5000000, Currency.UAH);
      const balance = Money.create(6000000, Currency.UAH);
      const account = Account.create({
        externalId: 'ext-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance,
        creditLimit,
      });

      expect(account.actualBalance.isPositive()).toBe(true);
      expect(account.actualBalance.amount).toBe(1000000);
    });
  });

  describe('credit card scenarios', () => {
    test('should handle credit card with no credit used', () => {
      const creditLimit = Money.create(5000000, Currency.UAH);
      const account = Account.create({
        externalId: 'credit-1',
        name: 'Monobank Credit',
        currency: Currency.UAH,
        balance: creditLimit,
        creditLimit,
        type: 'credit',
        maskedPan: ['5375****9999'],
        bank: 'monobank',
      });

      expect(account.isCreditAccount).toBe(true);
      expect(account.actualBalance.isZero()).toBe(true);
    });

    test('should handle credit card with partial credit used', () => {
      const creditLimit = Money.create(5000000, Currency.UAH);
      const balance = Money.create(4000000, Currency.UAH);
      const account = Account.create({
        externalId: 'credit-1',
        name: 'Credit Card',
        currency: Currency.UAH,
        balance,
        creditLimit,
      });

      expect(account.isCreditAccount).toBe(true);
      expect(account.actualBalance.amount).toBe(-1000000);
    });
  });

  describe('regular account scenarios', () => {
    test('should handle regular debit account', () => {
      const balance = Money.create(250000, Currency.UAH);
      const account = Account.create({
        externalId: 'debit-1',
        name: 'Monobank Black',
        currency: Currency.UAH,
        balance,
        type: 'debit',
        iban: 'UA213223130000026201234567890',
        maskedPan: ['5375****1234'],
        bank: 'monobank',
        lastSyncTime: 1704067200,
      });

      expect(account.isCreditAccount).toBe(false);
      expect(account.actualBalance.equals(balance)).toBe(true);
      expect(account.type).toBe('debit');
      expect(account.iban).toBe('UA213223130000026201234567890');
      expect(account.bank).toBe('monobank');
    });

    test('should handle account with zero balance', () => {
      const account = Account.create({
        externalId: 'empty-1',
        name: 'Empty Account',
        currency: Currency.USD,
        balance: Money.create(0, Currency.USD),
      });

      expect(account.balance.isZero()).toBe(true);
      expect(account.actualBalance.isZero()).toBe(true);
      expect(account.isCreditAccount).toBe(false);
    });

    test('should handle account with negative balance', () => {
      const balance = Money.create(-50000, Currency.EUR);
      const account = Account.create({
        externalId: 'negative-1',
        name: 'Overdraft Account',
        currency: Currency.EUR,
        balance,
      });

      expect(account.balance.isNegative()).toBe(true);
      expect(account.actualBalance.isNegative()).toBe(true);
      expect(account.isCreditAccount).toBe(false);
    });
  });
});
