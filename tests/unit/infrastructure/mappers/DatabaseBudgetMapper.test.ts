import { describe, expect, test } from 'bun:test';
import { Budget } from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { DatabaseBudgetMapper } from '@infrastructure/mappers/DatabaseBudgetMapper.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

describe('DatabaseBudgetMapper', () => {
  const mapper = new DatabaseBudgetMapper();

  describe('toEntity', () => {
    test('should create Budget with correct amount (from targetAmount), dates', () => {
      const row: BudgetRow = {
        id: 123,
        name: 'Groceries Budget',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 500000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget).toBeInstanceOf(Budget);
      expect(budget.name).toBe('Groceries Budget');
      expect(budget.amount.amount).toBe(500000);
      expect(budget.amount.currency.code).toBe('UAH');
      expect(budget.startDate).toEqual(new Date('2024-01-01'));
      expect(budget.endDate).toEqual(new Date('2024-12-31'));
      expect(budget.dbId).toBe(123);
    });

    test('should use default startDate when null', () => {
      const row: BudgetRow = {
        id: 456,
        name: 'Default Start',
        type: 'spending',
        currency: 'USD',
        targetAmount: 100000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: '2024-12-31',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget.startDate).toEqual(new Date(0));
    });

    test('should use default endDate when null', () => {
      const row: BudgetRow = {
        id: 789,
        name: 'Default End',
        type: 'spending',
        currency: 'EUR',
        targetAmount: 75000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: '2024-01-01',
        endDate: null,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget.endDate).toEqual(new Date('2099-12-31'));
    });

    test('should handle both dates null', () => {
      const row: BudgetRow = {
        id: 999,
        name: 'No Dates',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 10000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget.startDate).toEqual(new Date(0));
      expect(budget.endDate).toEqual(new Date('2099-12-31'));
    });

    test('should create Money with correct currency', () => {
      const row: BudgetRow = {
        id: 111,
        name: 'USD Budget',
        type: 'spending',
        currency: 'USD',
        targetAmount: 200000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget.amount.currency.code).toBe('USD');
    });
  });

  describe('toInsert', () => {
    test('should create insert row with all fields', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Monthly Groceries',
        amount: Money.create(500000, currency),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.name).toBe('Monthly Groceries');
      expect(row.type).toBe('spending');
      expect(row.currency).toBe('UAH');
      expect(row.targetAmount).toBe(500000);
      expect(row.targetCadence).toBeNull();
      expect(row.targetCadenceMonths).toBeNull();
      expect(row.targetDate).toBeNull();
      expect(row.isArchived).toBe(false);
    });

    test('should format startDate correctly', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Test Budget',
        amount: Money.create(100000, currency),
        startDate: new Date('2024-06-15T10:30:00Z'),
        endDate: new Date('2024-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBe('2024-06-15');
    });

    test('should format endDate correctly', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Test Budget',
        amount: Money.create(100000, currency),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31T23:59:59Z'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBe('2024-12-31');
    });

    test('should set startDate to null when date is epoch (0)', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No Start',
        amount: Money.create(100000, currency),
        startDate: new Date(0),
        endDate: new Date('2024-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBeNull();
    });

    test('should set endDate to null when year is 2099 or later', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No End',
        amount: Money.create(100000, currency),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2099-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBeNull();
    });

    test('should handle both dates as null when using defaults', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Default Dates',
        amount: Money.create(100000, currency),
        startDate: new Date(0),
        endDate: new Date('2100-01-01'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBeNull();
      expect(row.endDate).toBeNull();
    });

    test('should handle different currencies', () => {
      const usdBudget = Budget.create({
        name: 'USD Budget',
        amount: Money.create(200000, Currency.USD),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const eurBudget = Budget.create({
        name: 'EUR Budget',
        amount: Money.create(150000, Currency.EUR),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const usdRow: NewBudgetRow = mapper.toInsert(usdBudget);
      const eurRow: NewBudgetRow = mapper.toInsert(eurBudget);

      expect(usdRow.currency).toBe('USD');
      expect(eurRow.currency).toBe('EUR');
    });

    test('should always set type to spending', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Any Budget',
        amount: Money.create(100000, currency),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.type).toBe('spending');
    });

    test('should always set isArchived to false', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Active Budget',
        amount: Money.create(100000, currency),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.isArchived).toBe(false);
    });
  });
});
