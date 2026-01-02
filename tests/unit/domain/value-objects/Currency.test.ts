import { describe, expect, test } from 'bun:test';
import { Currency } from '@domain/value-objects/Currency.ts';

describe('Currency', () => {
  describe('fromCode', () => {
    test('should create currency from valid 3-letter code', () => {
      const currency = Currency.fromCode('USD');

      expect(currency.code).toBe('USD');
    });

    test('should convert lowercase code to uppercase', () => {
      const currency = Currency.fromCode('usd');

      expect(currency.code).toBe('USD');
    });

    test('should convert mixed case code to uppercase', () => {
      const currency = Currency.fromCode('Eur');

      expect(currency.code).toBe('EUR');
    });

    test('should throw error for code shorter than 3 characters', () => {
      expect(() => Currency.fromCode('US')).toThrow(
        'Invalid currency code: US',
      );
    });

    test('should throw error for code longer than 3 characters', () => {
      expect(() => Currency.fromCode('USDD')).toThrow(
        'Invalid currency code: USDD',
      );
    });

    test('should throw error for code with numbers', () => {
      expect(() => Currency.fromCode('US1')).toThrow(
        'Invalid currency code: US1',
      );
    });

    test('should throw error for empty string', () => {
      expect(() => Currency.fromCode('')).toThrow('Invalid currency code: ');
    });
  });

  describe('fromNumericCode', () => {
    test('should create UAH from numeric code 980', () => {
      const currency = Currency.fromNumericCode(980);

      expect(currency.code).toBe('UAH');
    });

    test('should create USD from numeric code 840', () => {
      const currency = Currency.fromNumericCode(840);

      expect(currency.code).toBe('USD');
    });

    test('should create EUR from numeric code 978', () => {
      const currency = Currency.fromNumericCode(978);

      expect(currency.code).toBe('EUR');
    });

    test('should create GBP from numeric code 826', () => {
      const currency = Currency.fromNumericCode(826);

      expect(currency.code).toBe('GBP');
    });

    test('should create PLN from numeric code 985', () => {
      const currency = Currency.fromNumericCode(985);

      expect(currency.code).toBe('PLN');
    });

    test('should throw error for unknown numeric code', () => {
      expect(() => Currency.fromNumericCode(999)).toThrow(
        'Unknown numeric currency code: 999',
      );
    });

    test('should throw error for zero', () => {
      expect(() => Currency.fromNumericCode(0)).toThrow(
        'Unknown numeric currency code: 0',
      );
    });
  });

  describe('static instances', () => {
    test('should have UAH static instance', () => {
      expect(Currency.UAH.code).toBe('UAH');
    });

    test('should have USD static instance', () => {
      expect(Currency.USD.code).toBe('USD');
    });

    test('should have EUR static instance', () => {
      expect(Currency.EUR.code).toBe('EUR');
    });
  });

  describe('equals', () => {
    test('should return true for same currency code', () => {
      const currency1 = Currency.fromCode('USD');
      const currency2 = Currency.fromCode('USD');

      expect(currency1.equals(currency2)).toBe(true);
    });

    test('should return true when comparing with static instance', () => {
      const currency = Currency.fromCode('UAH');

      expect(currency.equals(Currency.UAH)).toBe(true);
    });

    test('should return false for different currency codes', () => {
      const usd = Currency.fromCode('USD');
      const eur = Currency.fromCode('EUR');

      expect(usd.equals(eur)).toBe(false);
    });

    test('should return true for currency created from numeric code', () => {
      const fromNumeric = Currency.fromNumericCode(840);
      const fromString = Currency.fromCode('USD');

      expect(fromNumeric.equals(fromString)).toBe(true);
    });
  });

  describe('toString', () => {
    test('should return currency code', () => {
      const currency = Currency.fromCode('EUR');

      expect(currency.toString()).toBe('EUR');
    });

    test('should return same value as code property', () => {
      const currency = Currency.UAH;

      expect(currency.toString()).toBe(currency.code);
    });
  });
});
