import { describe, expect, test } from 'bun:test';
import { BudgetGroup } from '@domain/entities/BudgetGroup.ts';

describe('BudgetGroup', () => {
  const defaultProps = {
    name: 'Monthly Bills',
    sortOrder: 'a0' as string | null,
  };

  describe('create', () => {
    test('should create a BudgetGroup with valid props', () => {
      const group = BudgetGroup.create(defaultProps);

      expect(group.name).toBe('Monthly Bills');
      expect(group.sortOrder).toBe('a0');
      expect(group.dbId).toBeNull();
    });

    test('should create with dbId when provided', () => {
      const group = BudgetGroup.create({ ...defaultProps, dbId: 5 });

      expect(group.dbId).toBe(5);
    });

    test('should create with null sortOrder', () => {
      const group = BudgetGroup.create({ ...defaultProps, sortOrder: null });

      expect(group.sortOrder).toBeNull();
    });

    test('should use name as default id', () => {
      const group = BudgetGroup.create(defaultProps);

      expect(group.id).toBe('Monthly Bills');
    });

    test('should use custom id when provided', () => {
      const group = BudgetGroup.create(defaultProps, 'custom-id');

      expect(group.id).toBe('custom-id');
    });
  });

  describe('withDbId', () => {
    test('should return new instance with updated dbId', () => {
      const original = BudgetGroup.create(defaultProps);
      const withId = original.withDbId(10);

      expect(withId.dbId).toBe(10);
      expect(withId.name).toBe(original.name);
      expect(withId.sortOrder).toBe(original.sortOrder);
    });

    test('should preserve original id', () => {
      const original = BudgetGroup.create(defaultProps, 'my-id');
      const withId = original.withDbId(10);

      expect(withId.id).toBe('my-id');
    });
  });

  describe('withUpdatedProps', () => {
    test('should update name', () => {
      const original = BudgetGroup.create(defaultProps);
      const updated = original.withUpdatedProps({ name: 'Savings Goals' });

      expect(updated.name).toBe('Savings Goals');
      expect(updated.sortOrder).toBe(original.sortOrder);
    });

    test('should update sortOrder', () => {
      const original = BudgetGroup.create(defaultProps);
      const updated = original.withUpdatedProps({ sortOrder: 'b5' });

      expect(updated.sortOrder).toBe('b5');
      expect(updated.name).toBe(original.name);
    });

    test('should preserve id', () => {
      const original = BudgetGroup.create(defaultProps, 'preserved');
      const updated = original.withUpdatedProps({ name: 'New Name' });

      expect(updated.id).toBe('preserved');
    });
  });
});
