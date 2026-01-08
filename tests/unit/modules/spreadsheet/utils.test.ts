import { describe, expect, test } from 'bun:test';
import {
  columnIndexToLetter,
  letterToColumnIndex,
} from '@modules/spreadsheet/utils.ts';

describe('columnIndexToLetter', () => {
  test('converts single-letter columns correctly', () => {
    expect(columnIndexToLetter(0)).toBe('A');
    expect(columnIndexToLetter(1)).toBe('B');
    expect(columnIndexToLetter(25)).toBe('Z');
  });

  test('converts double-letter columns correctly', () => {
    expect(columnIndexToLetter(26)).toBe('AA');
    expect(columnIndexToLetter(27)).toBe('AB');
    expect(columnIndexToLetter(51)).toBe('AZ');
    expect(columnIndexToLetter(52)).toBe('BA');
  });

  test('converts triple-letter columns correctly', () => {
    expect(columnIndexToLetter(702)).toBe('AAA');
    expect(columnIndexToLetter(703)).toBe('AAB');
  });
});

describe('letterToColumnIndex', () => {
  test('converts single-letter columns correctly', () => {
    expect(letterToColumnIndex('A')).toBe(0);
    expect(letterToColumnIndex('B')).toBe(1);
    expect(letterToColumnIndex('Z')).toBe(25);
  });

  test('converts double-letter columns correctly', () => {
    expect(letterToColumnIndex('AA')).toBe(26);
    expect(letterToColumnIndex('AB')).toBe(27);
    expect(letterToColumnIndex('AZ')).toBe(51);
    expect(letterToColumnIndex('BA')).toBe(52);
  });

  test('converts triple-letter columns correctly', () => {
    expect(letterToColumnIndex('AAA')).toBe(702);
    expect(letterToColumnIndex('AAB')).toBe(703);
  });
});

describe('round-trip conversion', () => {
  test('columnIndexToLetter and letterToColumnIndex are inverses', () => {
    for (let index = 0; index < 100; index++) {
      const letter = columnIndexToLetter(index);
      expect(letterToColumnIndex(letter)).toBe(index);
    }
  });
});
