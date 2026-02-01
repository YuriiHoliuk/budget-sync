import { describe, expect, test } from 'bun:test';
import { Category } from '@domain/entities/Category.ts';
import { CategoryStatus } from '@domain/value-objects/index.ts';
import { DatabaseCategoryMapper } from '@infrastructure/mappers/DatabaseCategoryMapper.ts';
import type { CategoryRow, NewCategoryRow } from '@modules/database/types.ts';

describe('DatabaseCategoryMapper', () => {
  const mapper = new DatabaseCategoryMapper();

  describe('toEntity', () => {
    test('should create Category with correct name, status, dbId', () => {
      const row: CategoryRow = {
        id: 123,
        name: 'Food & Drinks',
        parentId: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row);

      expect(category).toBeInstanceOf(Category);
      expect(category.name).toBe('Food & Drinks');
      expect(category.status).toBe(CategoryStatus.ACTIVE);
      expect(category.dbId).toBe(123);
      expect(category.parent).toBeUndefined();
    });

    test('should handle parent name when provided', () => {
      const row: CategoryRow = {
        id: 456,
        name: 'Groceries',
        parentId: 123,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row, 'Food & Drinks');

      expect(category.name).toBe('Groceries');
      expect(category.parent).toBe('Food & Drinks');
      expect(category.dbId).toBe(456);
    });

    test('should map active status correctly', () => {
      const row: CategoryRow = {
        id: 1,
        name: 'Active Category',
        parentId: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row);

      expect(category.status).toBe(CategoryStatus.ACTIVE);
    });

    test('should map suggested status correctly', () => {
      const row: CategoryRow = {
        id: 2,
        name: 'Suggested Category',
        parentId: null,
        status: 'suggested',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row);

      expect(category.status).toBe(CategoryStatus.SUGGESTED);
    });

    test('should map archived status correctly', () => {
      const row: CategoryRow = {
        id: 3,
        name: 'Archived Category',
        parentId: null,
        status: 'archived',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row);

      expect(category.status).toBe(CategoryStatus.ARCHIVED);
    });

    test('should default to active status for unknown status', () => {
      const row: CategoryRow = {
        id: 4,
        name: 'Unknown Status',
        parentId: null,
        status: 'unknown' as 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const category = mapper.toEntity(row);

      expect(category.status).toBe(CategoryStatus.ACTIVE);
    });
  });

  describe('toInsert', () => {
    test('should create insert row with parentDbId', () => {
      const category = Category.create({
        name: 'Groceries',
        parent: 'Food & Drinks',
        status: CategoryStatus.ACTIVE,
      });

      const row: NewCategoryRow = mapper.toInsert(category, 123);

      expect(row.name).toBe('Groceries');
      expect(row.parentId).toBe(123);
      expect(row.status).toBe('active');
    });

    test('should create insert row without parentDbId', () => {
      const category = Category.create({
        name: 'Food & Drinks',
        status: CategoryStatus.ACTIVE,
      });

      const row: NewCategoryRow = mapper.toInsert(category);

      expect(row.name).toBe('Food & Drinks');
      expect(row.parentId).toBeNull();
      expect(row.status).toBe('active');
    });

    test('should handle active status', () => {
      const category = Category.create({
        name: 'Active',
        status: CategoryStatus.ACTIVE,
      });

      const row: NewCategoryRow = mapper.toInsert(category);

      expect(row.status).toBe('active');
    });

    test('should handle suggested status', () => {
      const category = Category.create({
        name: 'Suggested',
        status: CategoryStatus.SUGGESTED,
      });

      const row: NewCategoryRow = mapper.toInsert(category);

      expect(row.status).toBe('suggested');
    });

    test('should handle archived status', () => {
      const category = Category.create({
        name: 'Archived',
        status: CategoryStatus.ARCHIVED,
      });

      const row: NewCategoryRow = mapper.toInsert(category);

      expect(row.status).toBe('archived');
    });

    test('should set parentId to null when parentDbId is undefined', () => {
      const category = Category.create({
        name: 'Top Level',
        status: CategoryStatus.ACTIVE,
      });

      const row: NewCategoryRow = mapper.toInsert(category, undefined);

      expect(row.parentId).toBeNull();
    });
  });
});
