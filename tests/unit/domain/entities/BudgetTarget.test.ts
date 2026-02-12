import { describe, expect, test } from 'bun:test';
import { BudgetTarget } from '@domain/entities/BudgetTarget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';

describe('BudgetTarget', () => {
  const defaultProps = {
    budgetId: 1,
    targetAmount: Money.create(500000, Currency.UAH),
    effectiveFrom: '2026-02',
  };

  describe('create', () => {
    test('should create a BudgetTarget with valid props', () => {
      const target = BudgetTarget.create(defaultProps);

      expect(target.budgetId).toBe(1);
      expect(target.targetAmount.amount).toBe(500000);
      expect(target.effectiveFrom).toBe('2026-02');
      expect(target.dbId).toBeNull();
    });

    test('should create with dbId when provided', () => {
      const target = BudgetTarget.create({ ...defaultProps, dbId: 42 });

      expect(target.dbId).toBe(42);
    });

    test('should generate id from budgetId and effectiveFrom', () => {
      const target = BudgetTarget.create(defaultProps);

      expect(target.id).toBe('1-2026-02');
    });

    test('should use custom id when provided', () => {
      const target = BudgetTarget.create(defaultProps, 'custom-id');

      expect(target.id).toBe('custom-id');
    });

    test('should throw for invalid effectiveFrom format', () => {
      expect(() =>
        BudgetTarget.create({ ...defaultProps, effectiveFrom: '2026-2' }),
      ).toThrow('Invalid effectiveFrom format');
    });

    test('should throw for invalid month value', () => {
      expect(() =>
        BudgetTarget.create({ ...defaultProps, effectiveFrom: '2026-13' }),
      ).toThrow('Invalid effectiveFrom format');
    });

    test('should throw for non-YYYY-MM format', () => {
      expect(() =>
        BudgetTarget.create({ ...defaultProps, effectiveFrom: '2026-02-01' }),
      ).toThrow('Invalid effectiveFrom format');
    });

    test('should accept all valid months', () => {
      for (let month = 1; month <= 12; month++) {
        const monthStr = `2026-${String(month).padStart(2, '0')}`;
        const target = BudgetTarget.create({
          ...defaultProps,
          effectiveFrom: monthStr,
        });
        expect(target.effectiveFrom).toBe(monthStr);
      }
    });
  });

  describe('withDbId', () => {
    test('should return new instance with updated dbId', () => {
      const original = BudgetTarget.create(defaultProps);
      const withId = original.withDbId(99);

      expect(withId.dbId).toBe(99);
      expect(withId.budgetId).toBe(original.budgetId);
      expect(withId.targetAmount.amount).toBe(original.targetAmount.amount);
      expect(withId.effectiveFrom).toBe(original.effectiveFrom);
    });

    test('should preserve original id', () => {
      const original = BudgetTarget.create(defaultProps, 'my-id');
      const withId = original.withDbId(99);

      expect(withId.id).toBe('my-id');
    });
  });
});
