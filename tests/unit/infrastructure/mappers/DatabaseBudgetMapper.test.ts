import { describe, expect, test } from 'bun:test';
import { Budget } from '@domain/entities/Budget.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { DatabaseBudgetMapper } from '@infrastructure/mappers/DatabaseBudgetMapper.ts';
import type { BudgetRow, NewBudgetRow } from '@modules/database/types.ts';

// Helper to create a default BudgetRow with old columns for backward compatibility
function createBudgetRow(overrides: Partial<BudgetRow>): BudgetRow {
  return {
    id: 1,
    name: 'Test Budget',
    type: 'spending',
    currency: 'UAH',
    targetAmount: 100000,
    targetCadence: null,
    targetCadenceMonths: null,
    cadenceUnit: null,
    cadenceCount: null,
    targetDate: null,
    startDate: null,
    endDate: null,
    isArchived: false,
    cap: null,
    budgetGroupId: null,
    sortOrder: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('DatabaseBudgetMapper', () => {
  const mapper = new DatabaseBudgetMapper();

  describe('toEntity', () => {
    test('should create Budget with correct amount (from targetAmount), dates', () => {
      const row = createBudgetRow({
        id: 123,
        name: 'Groceries Budget',
        targetAmount: 500000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        sortOrder: 'a0',
      });

      const budget = mapper.toEntity(row);

      expect(budget).toBeInstanceOf(Budget);
      expect(budget.name).toBe('Groceries Budget');
      expect(budget.amount.amount).toBe(500000);
      expect(budget.amount.currency.code).toBe('UAH');
      expect(budget.startDate).toEqual(new Date('2024-01-01'));
      expect(budget.endDate).toEqual(new Date('2024-12-31'));
      expect(budget.isArchived).toBe(false);
      expect(budget.dbId).toBe(123);
      expect(budget.sortOrder).toBe('a0');
    });

    test('should use null startDate when null in row', () => {
      const row = createBudgetRow({
        id: 456,
        name: 'Default Start',
        currency: 'USD',
        endDate: '2024-12-31',
      });

      const budget = mapper.toEntity(row);

      expect(budget.startDate).toBeNull();
    });

    test('should use null endDate when null in row', () => {
      const row = createBudgetRow({
        id: 789,
        name: 'Default End',
        currency: 'EUR',
        targetAmount: 75000,
        startDate: '2024-01-01',
      });

      const budget = mapper.toEntity(row);

      expect(budget.endDate).toBeNull();
    });

    test('should handle both dates null', () => {
      const row = createBudgetRow({
        id: 999,
        name: 'No Dates',
        targetAmount: 10000,
      });

      const budget = mapper.toEntity(row);

      expect(budget.startDate).toBeNull();
      expect(budget.endDate).toBeNull();
    });

    test('should create Money with correct currency', () => {
      const row = createBudgetRow({
        id: 111,
        name: 'USD Budget',
        currency: 'USD',
        targetAmount: 200000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      const budget = mapper.toEntity(row);

      expect(budget.amount.currency.code).toBe('USD');
    });

    test('should map cadence unit fields', () => {
      const row = createBudgetRow({
        name: 'Periodic Budget',
        targetAmount: 1200000,
        cadenceUnit: 'year',
        cadenceCount: 1,
        targetDate: '2026-06-01',
        sortOrder: 'a5',
      });

      const budget = mapper.toEntity(row);

      expect(budget.cadenceUnit).toBe('year');
      expect(budget.targetDate).toEqual(new Date('2026-06-01'));
    });

    test('should fallback to old cadence columns when new ones are null', () => {
      const row = createBudgetRow({
        name: 'Legacy Periodic Budget',
        targetAmount: 1200000,
        targetCadence: 'monthly',
        targetCadenceMonths: null,
        cadenceUnit: null,
        cadenceCount: null,
      });

      const budget = mapper.toEntity(row);

      expect(budget.cadenceUnit).toBe('month');
      expect(budget.cadenceCount).toBe(1);
    });

    test('should fallback to old custom cadence', () => {
      const row = createBudgetRow({
        name: 'Legacy Custom Cadence',
        targetAmount: 900000,
        targetCadence: 'custom',
        targetCadenceMonths: 3,
        cadenceUnit: null,
        cadenceCount: null,
      });

      const budget = mapper.toEntity(row);

      expect(budget.cadenceUnit).toBe('month');
      expect(budget.cadenceCount).toBe(3);
    });

    test('should map isArchived', () => {
      const row = createBudgetRow({
        name: 'Archived Budget',
        isArchived: true,
      });

      const budget = mapper.toEntity(row);
      expect(budget.isArchived).toBe(true);
    });

    test('should map sortOrder', () => {
      const row = createBudgetRow({
        name: 'Ordered Budget',
        sortOrder: 'a3',
      });

      const budget = mapper.toEntity(row);
      expect(budget.sortOrder).toBe('a3');
    });

    test('should map null sortOrder', () => {
      const row = createBudgetRow({
        name: 'Unordered Budget',
        sortOrder: null,
      });

      const budget = mapper.toEntity(row);
      expect(budget.sortOrder).toBeNull();
    });
  });

  describe('toInsert', () => {
    test('should create insert row with all fields', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Monthly Groceries',
        amount: Money.create(500000, currency),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: 'a0',
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.name).toBe('Monthly Groceries');
      expect(row.currency).toBe('UAH');
      expect(row.targetAmount).toBe(500000);
      expect(row.cadenceUnit).toBeNull();
      expect(row.cadenceCount).toBeNull();
      expect(row.targetDate).toBeNull();
      expect(row.isArchived).toBe(false);
      expect(row.sortOrder).toBe('a0');
      // Dual-write: old columns should also be set
      expect(row.type).toBe('spending');
      expect(row.targetCadence).toBeNull();
      expect(row.targetCadenceMonths).toBeNull();
    });

    test('should format startDate correctly', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Test Budget',
        amount: Money.create(100000, currency),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-06-15T10:30:00Z'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBe('2024-06-15');
    });

    test('should format endDate correctly', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'Test Budget',
        amount: Money.create(100000, currency),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31T23:59:59Z'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBe('2024-12-31');
    });

    test('should set startDate to null when null', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No Start',
        amount: Money.create(100000, currency),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: null,
        endDate: new Date('2024-12-31'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.startDate).toBeNull();
    });

    test('should set endDate to null when null', () => {
      const currency = Currency.UAH;
      const budget = Budget.create({
        name: 'No End',
        amount: Money.create(100000, currency),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.endDate).toBeNull();
    });

    test('should handle different currencies', () => {
      const usdBudget = Budget.create({
        name: 'USD Budget',
        amount: Money.create(200000, Currency.USD),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const eurBudget = Budget.create({
        name: 'EUR Budget',
        amount: Money.create(150000, Currency.EUR),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const usdRow: NewBudgetRow = mapper.toInsert(usdBudget);
      const eurRow: NewBudgetRow = mapper.toInsert(eurBudget);

      expect(usdRow.currency).toBe('USD');
      expect(eurRow.currency).toBe('EUR');
    });

    test('should preserve isArchived', () => {
      const budget = Budget.create({
        name: 'Archived Budget',
        amount: Money.create(100000, Currency.UAH),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: true,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.isArchived).toBe(true);
    });

    test('should preserve target fields for goal budget', () => {
      const budget = Budget.create({
        name: 'Goal Budget',
        amount: Money.create(5000000, Currency.UAH),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: new Date('2026-12-01'),
        startDate: null,
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.targetDate).toBe('2026-12-01');
    });

    test('should dual-write cadence to old columns', () => {
      const budget = Budget.create({
        name: 'Monthly Budget',
        amount: Money.create(500000, Currency.UAH),
        cadenceUnit: 'month',
        cadenceCount: 1,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.cadenceUnit).toBe('month');
      expect(row.cadenceCount).toBe(1);
      // Dual-write to old columns
      expect(row.targetCadence).toBe('monthly');
      expect(row.targetCadenceMonths).toBeNull();
    });

    test('should dual-write custom cadence to old columns', () => {
      const budget = Budget.create({
        name: 'Quarterly Budget',
        amount: Money.create(900000, Currency.UAH),
        cadenceUnit: 'month',
        cadenceCount: 3,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.cadenceUnit).toBe('month');
      expect(row.cadenceCount).toBe(3);
      // Dual-write to old columns as 'custom'
      expect(row.targetCadence).toBe('custom');
      expect(row.targetCadenceMonths).toBe(3);
    });

    test('should map sortOrder to insert row', () => {
      const budget = Budget.create({
        name: 'Ordered Budget',
        amount: Money.create(100000, Currency.UAH),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: 'a5',
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.sortOrder).toBe('a5');
    });

    test('should map null sortOrder to insert row', () => {
      const budget = Budget.create({
        name: 'Unordered Budget',
        amount: Money.create(100000, Currency.UAH),
        cadenceUnit: null,
        cadenceCount: null,
        targetDate: null,
        startDate: null,
        endDate: null,
        isArchived: false,
        cap: null,
        budgetGroupId: null,
        sortOrder: null,
      });

      const row: NewBudgetRow = mapper.toInsert(budget);

      expect(row.sortOrder).toBeNull();
    });
  });
});
