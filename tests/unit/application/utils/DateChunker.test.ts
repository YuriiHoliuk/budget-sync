import { describe, expect, test } from 'bun:test';
import { chunkDateRange } from '@application/utils/DateChunker.ts';

describe('chunkDateRange', () => {
  describe('basic chunking', () => {
    test('should return single chunk for range smaller than maxDays', () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-01-15');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks).toHaveLength(1);
      const firstChunk = chunks[0];
      expect(firstChunk).toBeDefined();
      expect(firstChunk?.from.getTime()).toBe(from.getTime());
      expect(firstChunk?.to.getTime()).toBe(to.getTime());
    });

    test('should return single chunk for range exactly equal to maxDays', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-02-01T00:00:00.000Z'); // 31 days later

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks).toHaveLength(1);
      const firstChunk = chunks[0];
      expect(firstChunk).toBeDefined();
      expect(firstChunk?.from.getTime()).toBe(from.getTime());
      expect(firstChunk?.to.getTime()).toBe(to.getTime());
    });

    test('should split range larger than maxDays into multiple chunks', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-03-01T00:00:00.000Z'); // 60 days

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks).toHaveLength(2);
      const firstChunk = chunks[0];
      const lastChunk = chunks[1];
      expect(firstChunk).toBeDefined();
      expect(lastChunk).toBeDefined();
      expect(firstChunk?.from.getTime()).toBe(from.getTime());
      expect(lastChunk?.to.getTime()).toBe(to.getTime());
    });

    test('should create contiguous chunks with no gaps', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-04-01T00:00:00.000Z'); // ~90 days

      const chunks = chunkDateRange(from, to, 31);

      for (let index = 0; index < chunks.length - 1; index++) {
        const currentChunk = chunks[index];
        const nextChunk = chunks[index + 1];
        expect(currentChunk).toBeDefined();
        expect(nextChunk).toBeDefined();
        expect(currentChunk?.to.getTime()).toBe(nextChunk?.from.getTime());
      }
    });
  });

  describe('edge cases', () => {
    test('should return empty array when from equals to', () => {
      const date = new Date('2024-01-01');

      const chunks = chunkDateRange(date, date, 31);

      expect(chunks).toHaveLength(0);
    });

    test('should return empty array when from is after to', () => {
      const from = new Date('2024-01-15');
      const to = new Date('2024-01-01');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks).toHaveLength(0);
    });

    test('should handle very small maxDays value', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-01-05T00:00:00.000Z'); // 4 days

      const chunks = chunkDateRange(from, to, 1);

      expect(chunks).toHaveLength(4);
    });

    test('should handle single day range', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-01-02T00:00:00.000Z'); // 1 day

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks).toHaveLength(1);
      const firstChunk = chunks[0];
      expect(firstChunk).toBeDefined();
      expect(firstChunk?.from.getTime()).toBe(from.getTime());
      expect(firstChunk?.to.getTime()).toBe(to.getTime());
    });
  });

  describe('default maxDays', () => {
    test('should use 31 days as default maxDays', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-03-15T00:00:00.000Z'); // ~73 days

      const chunks = chunkDateRange(from, to);

      // Should create 3 chunks: 31 + 31 + 11 days
      expect(chunks).toHaveLength(3);
    });
  });

  describe('immutability', () => {
    test('should not modify original date objects', () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-02-15');
      const originalFromTime = from.getTime();
      const originalToTime = to.getTime();

      chunkDateRange(from, to, 31);

      expect(from.getTime()).toBe(originalFromTime);
      expect(to.getTime()).toBe(originalToTime);
    });

    test('should return new Date objects for each chunk', () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-02-15');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks.length).toBeGreaterThan(0);
      const firstChunk = chunks[0];
      const lastChunk = chunks.at(-1);
      expect(firstChunk).toBeDefined();
      expect(lastChunk).toBeDefined();
      expect(firstChunk?.from).not.toBe(from);
      expect(lastChunk?.to).not.toBe(to);
    });
  });

  describe('chunk boundaries', () => {
    test('should have first chunk start at from date', () => {
      const from = new Date('2024-01-15T10:30:00.000Z');
      const to = new Date('2024-03-15T10:30:00.000Z');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks.length).toBeGreaterThan(0);
      const firstChunk = chunks[0];
      expect(firstChunk).toBeDefined();
      expect(firstChunk?.from.getTime()).toBe(from.getTime());
    });

    test('should have last chunk end at to date', () => {
      const from = new Date('2024-01-15T10:30:00.000Z');
      const to = new Date('2024-03-15T10:30:00.000Z');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks.length).toBeGreaterThan(0);
      const lastChunk = chunks.at(-1);
      expect(lastChunk).toBeDefined();
      expect(lastChunk?.to.getTime()).toBe(to.getTime());
    });

    test('should preserve time component in dates', () => {
      const from = new Date('2024-01-01T12:30:45.123Z');
      const to = new Date('2024-02-15T18:45:30.456Z');

      const chunks = chunkDateRange(from, to, 31);

      expect(chunks.length).toBeGreaterThan(0);
      const firstChunk = chunks[0];
      const lastChunk = chunks.at(-1);
      expect(firstChunk).toBeDefined();
      expect(lastChunk).toBeDefined();
      expect(firstChunk?.from.getHours()).toBe(from.getHours());
      expect(firstChunk?.from.getMinutes()).toBe(from.getMinutes());
      expect(lastChunk?.to.getHours()).toBe(to.getHours());
      expect(lastChunk?.to.getMinutes()).toBe(to.getMinutes());
    });
  });
});
