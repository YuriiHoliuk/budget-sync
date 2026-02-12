import { describe, expect, test } from 'bun:test';
import { generateOrderKey } from '@modules/ordering/index.ts';

describe('generateOrderKey', () => {
  test('should generate first key when no bounds', () => {
    const key = generateOrderKey(null, null);
    expect(key).toBe('a0');
  });

  test('should generate key after a given key', () => {
    const key = generateOrderKey('a0', null);
    expect(key).toBe('a1');
  });

  test('should generate key before a given key', () => {
    const key = generateOrderKey(null, 'a1');
    expect(key).toBe('a0');
  });

  test('should generate key between two keys', () => {
    const key = generateOrderKey('a0', 'a2');
    expect(key).toBe('a1');
  });

  test('should generate key between adjacent keys', () => {
    const key = generateOrderKey('a0', 'a1');
    expect(key).toBe('a0V');
  });

  test('should maintain sort order for generated sequence', () => {
    let key: string | null = null;
    const keys: string[] = [];
    for (let index = 0; index < 10; index++) {
      key = generateOrderKey(key, null);
      keys.push(key);
    }

    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});
