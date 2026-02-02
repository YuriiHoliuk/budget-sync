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
      expect(budget.type).toBe('spending');
      expect(budget.amount.amount).toBe(500000);
      expect(budget.amount.currency.code).toBe('UAH');
      expect(budget.startDate).toEqual(new Date('2024-01-01'));
      expect(budget.endDate).toEqual(new Date('2024-12-31'));
      expect(budget.isArchived).toBe(false);
      expect(budget.dbId).toBe(123);
    });

    test('should use null startDate when null in row', () => {
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

      expect(budget.startDate).toBeNull();
    });

    test('should use null endDate when null in row', () => {
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

      expect(budget.endDate).toBeNull();
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

      expect(budget.startDate).toBeNull();
      expect(budget.endDate).toBeNull();
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

    test('should map budget type correctly', () => {
      const types = ['spending', 'savings', 'goal', 'periodic'] as const;
      for (const budgetType of types) {
        const row: BudgetRow = {
          id: 1,
          name: `${budgetType} budget`,
          type: budgetType,
          currency: 'UAH',
          targetAmount: 100000,
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
        expect(budget.type).toBe(budgetType);
      }
    });

    test('should map target cadence fields', () => {
      const row: BudgetRow = {
        id: 1,
        name: 'Periodic Budget',
        type: 'periodic',
        currency: 'UAH',
        targetAmount: 1200000,
        targetCadence: 'yearly',
        targetCadenceMonths: null,
        targetDate: '2026-06-01',
        startDate: null,
        endDate: null,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);

      expect(budget.targetCadence).toBe('yearly');
      expect(budget.targetDate).toEqual(new Date('2026-06-01'));
    });

    test('should map isArchived', () => {
      const row: BudgetRow = {
        id: 1,
        name: 'Archived Budget',
        type: 'spending',
        currency: 'UAH',
        targetAmount: 100000,
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const budget = mapper.toEntity(row);
      expect(budget.isArchived).toBe(true);
    });
  });

  describe('toInsert', () => {
    test('should create insert row with all fields', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Monthly Groceries',
        type: 'spending',
        amount: Money.create(500000, currency),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
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
        type: 'spending',
        amount: Money.create(100000, currency),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-06-15T10:30:00Z'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBe('2024-06-15');
    });

    test('should format endDate correctly', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Test Budget',
        type: 'spending',
        amount: Money.create(100000, currency),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBe('2024-12-31');
    });

    test('should set startDate to null when null', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No Start',
        type: 'spending',
        amount: Money.create(100000, currency),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: new Date('2024-12-31'),
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBeNull();
    });

    test('should set endDate to null when null', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No End',
        type: 'spending',
        amount: Money.create(100000, currency),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: null,
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBeNull();
    });

    test('should handle different currencies', () => {
      const usdBudget = Budget.create({
        name: 'USD Budget',
        type: 'spending',
        amount: Money.create(200000, Currency.USD),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
      });

      const eurBudget = Budget.create({
        name: 'EUR Budget',
        type: 'spending',
        amount: Money.create(150000, Currency.EUR),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
      });

      const usdRow: NewBudgetRow = mapper.toInsert(usdBudget);
      const eurRow: NewBudgetRow = mapper.toInsert(eurBudget);

      expect(usdRow.currency).toBe('USD');
      expect(eurRow.currency).toBe('EUR');
    });

    test('should preserve budget type', () => {
      const budget = Budget.create({
        name: 'Savings Budget',
        type: 'savings',
        amount: Money.create(100000, Currency.UAH),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.type).toBe('savings');
    });

    test('should preserve isArchived', () => {
      const budget = Budget.create({
        name: 'Archived Budget',
        type: 'spending',
        amount: Money.create(100000, Currency.UAH),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: true,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.isArchived).toBe(true);
    });

    test('should preserve target fields for goal budget', () => {
      const budget = Budget.create({
        name: 'Goal Budget',
        type: 'goal',
        amount: Money.create(5000000, Currency.UAH),
        targetCadence: null,
        targetCadenceMonths: null,
        targetDate: new Date('2026-12-01'),
        startDate: null,
        endDate: null,
        isArchived: false,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.type).toBe('goal');
      expect(row.targetDate).toBe('2026-12-01');
    });
  });
});
