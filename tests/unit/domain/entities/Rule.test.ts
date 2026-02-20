import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Rule } from '@domain/entities/Rule.ts';

describe('Rule', () => {
  const validProps = {
    rule: 'Assign Bolt transactions to Transport > Taxi',
    priority: 10,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    dbId: 1,
  };

  test('should create a rule with valid props', () => {
    const rule = Rule.create(validProps);

    expect(rule.rule).toBe('Assign Bolt transactions to Transport > Taxi');
    expect(rule.priority).toBe(10);
    expect(rule.id).toBe(1);
    expect(rule.dbId).toBe(1);
    expect(rule.createdAt).toEqual(new Date('2026-01-01'));
    expect(rule.updatedAt).toEqual(new Date('2026-01-01'));
  });

  test('should throw error when rule text is empty', () => {
    expect(() => Rule.create({ ...validProps, rule: '' })).toThrow(
      'Rule text cannot be empty',
    );
  });

  test('should throw error when rule text is whitespace only', () => {
    expect(() => Rule.create({ ...validProps, rule: '   ' })).toThrow(
      'Rule text cannot be empty',
    );
  });

  test('should return 0 for id when dbId is not set', () => {
    const rule = Rule.create({ ...validProps, dbId: undefined });
    expect(rule.id).toBe(0);
  });

  test('should return null for dbId when not set', () => {
    const rule = Rule.create({ ...validProps, dbId: undefined });
    expect(rule.dbId).toBeNull();
  });

  test('should create a new rule with updated dbId', () => {
    const rule = Rule.create({ ...validProps, dbId: undefined });
    const withId = rule.withDbId(42);

    expect(withId.dbId).toBe(42);
    expect(withId.id).toBe(42);
    expect(withId.rule).toBe(rule.rule);
    expect(withId.priority).toBe(rule.priority);
  });

  test('should create a new rule with updated props', () => {
    const rule = Rule.create(validProps);
    const updated = rule.withUpdatedProps({
      rule: 'Updated rule text',
      priority: 20,
    });

    expect(updated.rule).toBe('Updated rule text');
    expect(updated.priority).toBe(20);
    expect(updated.dbId).toBe(rule.dbId);
  });

  test('should keep original values when updating with partial props', () => {
    const rule = Rule.create(validProps);
    const updated = rule.withUpdatedProps({ priority: 5 });

    expect(updated.rule).toBe(rule.rule);
    expect(updated.priority).toBe(5);
  });

  test('should update the updatedAt timestamp on withUpdatedProps', () => {
    const rule = Rule.create(validProps);
    const updated = rule.withUpdatedProps({ rule: 'New text' });

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      rule.updatedAt.getTime(),
    );
  });
});
