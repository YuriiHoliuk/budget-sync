import { describe, expect, test } from 'bun:test';
import { Allocation } from '@domain/entities/Allocation.ts';
import { Currency, Money } from '@domain/value-objects/index.ts';
import { DatabaseAllocationMapper } from '@infrastructure/mappers/DatabaseAllocationMapper.ts';
import type {
  AllocationRow,
  NewAllocationRow,
} from '@modules/database/types.ts';

describe('DatabaseAllocationMapper', () => {
  const mapper = new DatabaseAllocationMapper();

  describe('toEntity', () => {
    test('should create Allocation with correct properties', () => {
      const row: AllocationRow = {
        id: 42,
        budgetId: 5,
        amount: 250000, // 2500.00 UAH in minor units
        period: '2024-06',
        date: '2024-06-15',
        notes: 'Monthly groceries allocation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation).toBeInstanceOf(Allocation);
      expect(allocation.dbId).toBe(42);
      expect(allocation.budgetId).toBe(5);
      expect(allocation.amount.amount).toBe(250000);
      expect(allocation.amount.currency.code).toBe('UAH');
      expect(allocation.period).toBe('2024-06');
      expect(allocation.date).toEqual(new Date('2024-06-15'));
      expect(allocation.notes).toBe('Monthly groceries allocation');
    });

    test('should handle null notes', () => {
      const row: AllocationRow = {
        id: 1,
        budgetId: 10,
        amount: 100000,
        period: '2024-01',
        date: '2024-01-05',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation.notes).toBeNull();
    });

    test('should handle negative amount (fund removal)', () => {
      const row: AllocationRow = {
        id: 2,
        budgetId: 3,
        amount: -50000, // Removing 500.00 UAH
        period: '2024-03',
        date: '2024-03-20',
        notes: 'Reallocating to savings',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation.amount.amount).toBe(-50000);
    });

    test('should handle zero amount', () => {
      const row: AllocationRow = {
        id: 3,
        budgetId: 7,
        amount: 0,
        period: '2024-07',
        date: '2024-07-01',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation.amount.amount).toBe(0);
    });

    test('should handle large amount values', () => {
      const row: AllocationRow = {
        id: 4,
        budgetId: 1,
        amount: 999999999, // ~10M UAH
        period: '2024-12',
        date: '2024-12-01',
        notes: 'Large budget allocation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation.amount.amount).toBe(999999999);
    });

    test('should parse date correctly from string format', () => {
      const row: AllocationRow = {
        id: 5,
        budgetId: 2,
        amount: 10000,
        period: '2024-02',
        date: '2024-02-29', // Leap year date
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const allocation = mapper.toEntity(row);

      expect(allocation.date.getFullYear()).toBe(2024);
      expect(allocation.date.getMonth()).toBe(1); // February (0-indexed)
      expect(allocation.date.getDate()).toBe(29);
    });

    test('should map period boundary months correctly', () => {
      // January
      const janRow: AllocationRow = {
        id: 6,
        budgetId: 1,
        amount: 10000,
        period: '2024-01',
        date: '2024-01-01',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(mapper.toEntity(janRow).period).toBe('2024-01');

      // December
      const decRow: AllocationRow = {
        id: 7,
        budgetId: 1,
        amount: 10000,
        period: '2024-12',
        date: '2024-12-31',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(mapper.toEntity(decRow).period).toBe('2024-12');
    });
  });

  describe('toInsert', () => {
    test('should create insert row with all fields', () => {
      const allocation = Allocation.create({
        budgetId: 15,
        amount: Money.create(350000, Currency.UAH),
        period: '2024-08',
        date: new Date('2024-08-10'),
        notes: 'August budget top-up',
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.budgetId).toBe(15);
      expect(row.amount).toBe(350000);
      expect(row.period).toBe('2024-08');
      expect(row.date).toBe('2024-08-10');
      expect(row.notes).toBe('August budget top-up');
    });

    test('should format date correctly (YYYY-MM-DD)', () => {
      const allocation = Allocation.create({
        budgetId: 1,
        amount: Money.create(10000, Currency.UAH),
        period: '2024-05',
        date: new Date('2024-05-25T14:30:00.000Z'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.date).toBe('2024-05-25');
    });

    test('should handle null notes', () => {
      const allocation = Allocation.create({
        budgetId: 3,
        amount: Money.create(50000, Currency.UAH),
        period: '2024-04',
        date: new Date('2024-04-01'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.notes).toBeNull();
    });

    test('should handle negative amount', () => {
      const allocation = Allocation.create({
        budgetId: 8,
        amount: Money.create(-75000, Currency.UAH),
        period: '2024-09',
        date: new Date('2024-09-15'),
        notes: 'Move funds out',
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.amount).toBe(-75000);
    });

    test('should handle zero amount', () => {
      const allocation = Allocation.create({
        budgetId: 4,
        amount: Money.create(0, Currency.UAH),
        period: '2024-10',
        date: new Date('2024-10-01'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.amount).toBe(0);
    });

    test('should preserve period format', () => {
      const allocation = Allocation.create({
        budgetId: 2,
        amount: Money.create(25000, Currency.UAH),
        period: '2025-01',
        date: new Date('2025-01-01'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.period).toBe('2025-01');
    });

    test('should handle date at start of year', () => {
      const allocation = Allocation.create({
        budgetId: 1,
        amount: Money.create(10000, Currency.UAH),
        period: '2024-01',
        date: new Date('2024-01-01T00:00:00.000Z'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.date).toBe('2024-01-01');
    });

    test('should handle date at end of year', () => {
      const allocation = Allocation.create({
        budgetId: 1,
        amount: Money.create(10000, Currency.UAH),
        period: '2024-12',
        date: new Date('2024-12-31T23:59:59.999Z'),
        notes: null,
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.date).toBe('2024-12-31');
    });

    test('should not include dbId in insert row', () => {
      const allocation = Allocation.create({
        budgetId: 5,
        amount: Money.create(100000, Currency.UAH),
        period: '2024-06',
        date: new Date('2024-06-01'),
        notes: null,
        dbId: 999, // Existing allocation with dbId
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      // NewAllocationRow should not have 'id' field
      expect('id' in row).toBe(false);
    });

    test('should handle empty notes string', () => {
      const allocation = Allocation.create({
        budgetId: 6,
        amount: Money.create(20000, Currency.UAH),
        period: '2024-11',
        date: new Date('2024-11-15'),
        notes: '',
      });

      const row: NewAllocationRow = mapper.toInsert(allocation);

      expect(row.notes).toBe('');
    });
  });

  describe('roundtrip conversion', () => {
    test('should preserve data through toEntity -> toInsert cycle', () => {
      const originalRow: AllocationRow = {
        id: 100,
        budgetId: 20,
        amount: 500000,
        period: '2024-07',
        date: '2024-07-15',
        notes: 'Test roundtrip',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const entity = mapper.toEntity(originalRow);
      const insertRow = mapper.toInsert(entity);

      expect(insertRow.budgetId).toBe(originalRow.budgetId);
      expect(insertRow.amount).toBe(originalRow.amount);
      expect(insertRow.period).toBe(originalRow.period);
      expect(insertRow.date).toBe(originalRow.date);
      expect(insertRow.notes).toBe(originalRow.notes);
    });

    test('should preserve negative amounts through roundtrip', () => {
      const originalRow: AllocationRow = {
        id: 101,
        budgetId: 5,
        amount: -200000,
        period: '2024-03',
        date: '2024-03-10',
        notes: 'Negative roundtrip',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const entity = mapper.toEntity(originalRow);
      const insertRow = mapper.toInsert(entity);

      expect(insertRow.amount).toBe(-200000);
    });
  });
});
