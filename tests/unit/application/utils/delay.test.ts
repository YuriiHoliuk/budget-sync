import { describe, expect, test } from 'bun:test';
import { delay } from '@application/utils/delay.ts';

describe('delay', () => {
  describe('return value', () => {
    test('should return a Promise', () => {
      const result = delay(0);

      expect(result).toBeInstanceOf(Promise);
    });

    test('should resolve to undefined', async () => {
      const result = await delay(0);

      expect(result).toBeUndefined();
    });
  });

  describe('timing behavior', () => {
    test('should resolve after approximately the specified time', async () => {
      const delayMs = 50;
      const start = Date.now();

      await delay(delayMs);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small tolerance
      expect(elapsed).toBeLessThan(100); // Should not take too long
    });

    test('should delay for longer duration accurately', async () => {
      const delayMs = 100;
      const start = Date.now();

      await delay(delayMs);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });

    test('should resolve quickly with zero delay', async () => {
      const start = Date.now();

      await delay(0);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Promise behavior', () => {
    test('should be awaitable', async () => {
      let executed = false;

      await delay(10);
      executed = true;

      expect(executed).toBe(true);
    });

    test('should work with Promise.all', async () => {
      const start = Date.now();

      await Promise.all([delay(50), delay(50), delay(50)]);

      const elapsed = Date.now() - start;
      // All delays run in parallel, so total time should be ~50ms, not ~150ms
      expect(elapsed).toBeLessThan(100);
    });

    test('should allow chaining with .then()', async () => {
      let chainExecuted = false;

      await delay(10).then(() => {
        chainExecuted = true;
      });

      expect(chainExecuted).toBe(true);
    });
  });
});
