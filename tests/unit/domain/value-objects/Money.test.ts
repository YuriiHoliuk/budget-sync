import { describe, expect, test } from 'bun:test';
import { Currency } from '@domain/value-objects/Currency.ts';
import { Money } from '@domain/value-objects/Money.ts';

describe('Money', () => {
  describe('create', () => {
    test('should create money with valid integer amount', () => {
      const money = Money.create(5000, Currency.UAH);

      expect(money.amount).toBe(5000);
      expect(money.currency.code).toBe('UAH');
    });

    test('should create money with zero amount', () => {
      const money = Money.create(0, Currency.USD);

      expect(money.amount).toBe(0);
    });

    test('should create money with negative amount', () => {
      const money = Money.create(-1500, Currency.EUR);

      expect(money.amount).toBe(-1500);
    });

    test('should throw error for non-integer amount', () => {
      expect(() => Money.create(50.5, Currency.UAH)).toThrow(
        'Amount must be an integer (minor units)',
      );
    });

    test('should throw error for floating point amount', () => {
      expect(() => Money.create(100.99, Currency.USD)).toThrow(
        'Amount must be an integer (minor units)',
      );
    });
  });

  describe('zero', () => {
    test('should create money with zero amount', () => {
      const money = Money.zero(Currency.UAH);

      expect(money.amount).toBe(0);
      expect(money.currency.code).toBe('UAH');
    });
  });

  describe('add', () => {
    test('should add two money values with same currency', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(3000, Currency.UAH);

      const result = money1.add(money2);

      expect(result.amount).toBe(8000);
      expect(result.currency.code).toBe('UAH');
    });

    test('should add negative money value', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(-2000, Currency.UAH);

      const result = money1.add(money2);

      expect(result.amount).toBe(3000);
    });

    test('should return new Money instance', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(3000, Currency.UAH);

      const result = money1.add(money2);

      expect(result).not.toBe(money1);
      expect(result).not.toBe(money2);
    });

    test('should throw error when adding different currencies', () => {
      const uah = Money.create(5000, Currency.UAH);
      const usd = Money.create(100, Currency.USD);

      expect(() => uah.add(usd)).toThrow(
        'Cannot operate on different currencies: UAH and USD',
      );
    });
  });

  describe('subtract', () => {
    test('should subtract two money values with same currency', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(3000, Currency.UAH);

      const result = money1.subtract(money2);

      expect(result.amount).toBe(2000);
    });

    test('should return negative result when subtracting larger amount', () => {
      const money1 = Money.create(3000, Currency.UAH);
      const money2 = Money.create(5000, Currency.UAH);

      const result = money1.subtract(money2);

      expect(result.amount).toBe(-2000);
    });

    test('should throw error when subtracting different currencies', () => {
      const eur = Money.create(5000, Currency.EUR);
      const usd = Money.create(100, Currency.USD);

      expect(() => eur.subtract(usd)).toThrow(
        'Cannot operate on different currencies: EUR and USD',
      );
    });
  });

  describe('multiply', () => {
    test('should multiply money by integer factor', () => {
      const money = Money.create(1000, Currency.UAH);

      const result = money.multiply(3);

      expect(result.amount).toBe(3000);
    });

    test('should multiply money by decimal factor and round', () => {
      const money = Money.create(1000, Currency.UAH);

      const result = money.multiply(1.5);

      expect(result.amount).toBe(1500);
    });

    test('should round result to nearest integer', () => {
      const money = Money.create(1000, Currency.UAH);

      const result = money.multiply(0.333);

      expect(result.amount).toBe(333);
    });

    test('should handle multiplication by zero', () => {
      const money = Money.create(5000, Currency.UAH);

      const result = money.multiply(0);

      expect(result.amount).toBe(0);
    });

    test('should handle multiplication by negative factor', () => {
      const money = Money.create(1000, Currency.UAH);

      const result = money.multiply(-2);

      expect(result.amount).toBe(-2000);
    });
  });

  describe('isNegative', () => {
    test('should return true for negative amount', () => {
      const money = Money.create(-100, Currency.UAH);

      expect(money.isNegative()).toBe(true);
    });

    test('should return false for positive amount', () => {
      const money = Money.create(100, Currency.UAH);

      expect(money.isNegative()).toBe(false);
    });

    test('should return false for zero amount', () => {
      const money = Money.create(0, Currency.UAH);

      expect(money.isNegative()).toBe(false);
    });
  });

  describe('isPositive', () => {
    test('should return true for positive amount', () => {
      const money = Money.create(100, Currency.UAH);

      expect(money.isPositive()).toBe(true);
    });

    test('should return false for negative amount', () => {
      const money = Money.create(-100, Currency.UAH);

      expect(money.isPositive()).toBe(false);
    });

    test('should return false for zero amount', () => {
      const money = Money.create(0, Currency.UAH);

      expect(money.isPositive()).toBe(false);
    });
  });

  describe('isZero', () => {
    test('should return true for zero amount', () => {
      const money = Money.create(0, Currency.UAH);

      expect(money.isZero()).toBe(true);
    });

    test('should return false for positive amount', () => {
      const money = Money.create(100, Currency.UAH);

      expect(money.isZero()).toBe(false);
    });

    test('should return false for negative amount', () => {
      const money = Money.create(-100, Currency.UAH);

      expect(money.isZero()).toBe(false);
    });
  });

  describe('abs', () => {
    test('should return absolute value for negative amount', () => {
      const money = Money.create(-5000, Currency.UAH);

      const result = money.abs();

      expect(result.amount).toBe(5000);
    });

    test('should return same value for positive amount', () => {
      const money = Money.create(5000, Currency.UAH);

      const result = money.abs();

      expect(result.amount).toBe(5000);
    });

    test('should return zero for zero amount', () => {
      const money = Money.create(0, Currency.UAH);

      const result = money.abs();

      expect(result.amount).toBe(0);
    });

    test('should preserve currency', () => {
      const money = Money.create(-5000, Currency.EUR);

      const result = money.abs();

      expect(result.currency.code).toBe('EUR');
    });
  });

  describe('negate', () => {
    test('should negate positive amount', () => {
      const money = Money.create(5000, Currency.UAH);

      const result = money.negate();

      expect(result.amount).toBe(-5000);
    });

    test('should negate negative amount to positive', () => {
      const money = Money.create(-5000, Currency.UAH);

      const result = money.negate();

      expect(result.amount).toBe(5000);
    });

    test('should return zero for zero amount', () => {
      const money = Money.create(0, Currency.UAH);

      const result = money.negate();

      expect(result.isZero()).toBe(true);
    });
  });

  describe('toMajorUnits', () => {
    test('should convert minor units to major units', () => {
      const money = Money.create(5000, Currency.UAH);

      expect(money.toMajorUnits()).toBe(50);
    });

    test('should handle fractional major units', () => {
      const money = Money.create(5050, Currency.UAH);

      expect(money.toMajorUnits()).toBe(50.5);
    });

    test('should handle zero', () => {
      const money = Money.create(0, Currency.UAH);

      expect(money.toMajorUnits()).toBe(0);
    });

    test('should handle negative amounts', () => {
      const money = Money.create(-2500, Currency.UAH);

      expect(money.toMajorUnits()).toBe(-25);
    });
  });

  describe('format', () => {
    test('should format money with currency code', () => {
      const money = Money.create(5000, Currency.UAH);

      expect(money.format()).toBe('50.00 UAH');
    });

    test('should format money with decimal places', () => {
      const money = Money.create(5099, Currency.USD);

      expect(money.format()).toBe('50.99 USD');
    });

    test('should format zero amount', () => {
      const money = Money.create(0, Currency.EUR);

      expect(money.format()).toBe('0.00 EUR');
    });

    test('should format negative amount', () => {
      const money = Money.create(-2550, Currency.UAH);

      expect(money.format()).toBe('-25.50 UAH');
    });

    test('should format single digit cents', () => {
      const money = Money.create(1005, Currency.USD);

      expect(money.format()).toBe('10.05 USD');
    });
  });

  describe('equals', () => {
    test('should return true for equal amount and currency', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(5000, Currency.UAH);

      expect(money1.equals(money2)).toBe(true);
    });

    test('should return false for different amounts', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(3000, Currency.UAH);

      expect(money1.equals(money2)).toBe(false);
    });

    test('should return false for different currencies', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(5000, Currency.USD);

      expect(money1.equals(money2)).toBe(false);
    });

    test('should return false when both amount and currency differ', () => {
      const money1 = Money.create(5000, Currency.UAH);
      const money2 = Money.create(100, Currency.USD);

      expect(money1.equals(money2)).toBe(false);
    });

    test('should return true for zero amounts with same currency', () => {
      const money1 = Money.zero(Currency.EUR);
      const money2 = Money.create(0, Currency.EUR);

      expect(money1.equals(money2)).toBe(true);
    });
  });

  describe('immutability', () => {
    test('add should not modify original money', () => {
      const original = Money.create(5000, Currency.UAH);
      const other = Money.create(3000, Currency.UAH);

      original.add(other);

      expect(original.amount).toBe(5000);
    });

    test('subtract should not modify original money', () => {
      const original = Money.create(5000, Currency.UAH);
      const other = Money.create(3000, Currency.UAH);

      original.subtract(other);

      expect(original.amount).toBe(5000);
    });

    test('multiply should not modify original money', () => {
      const original = Money.create(5000, Currency.UAH);

      original.multiply(2);

      expect(original.amount).toBe(5000);
    });

    test('abs should not modify original money', () => {
      const original = Money.create(-5000, Currency.UAH);

      original.abs();

      expect(original.amount).toBe(-5000);
    });

    test('negate should not modify original money', () => {
      const original = Money.create(5000, Currency.UAH);

      original.negate();

      expect(original.amount).toBe(5000);
    });
  });
});
