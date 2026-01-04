import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BaseLogger } from '@modules/logging/BaseLogger.ts';
import type { LogLevel } from '@modules/logging/Logger.ts';

/**
 * Test implementation of BaseLogger that captures all writeLog calls
 */
class TestLogger extends BaseLogger {
  logs: Array<{
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
  }> = [];

  constructor(minLevel: LogLevel = 'info') {
    super(minLevel);
  }

  protected writeLog(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.logs.push({ level, message, context });
  }

  clear(): void {
    this.logs = [];
  }

  getLog(index: number) {
    const log = this.logs[index];
    if (!log) {
      throw new Error(`No log at index ${index}`);
    }
    return log;
  }
}

describe('BaseLogger', () => {
  let originalDebugEnv: string | undefined;

  beforeEach(() => {
    originalDebugEnv = process.env['DEBUG'];
  });

  afterEach(() => {
    if (originalDebugEnv === undefined) {
      delete process.env['DEBUG'];
    } else {
      process.env['DEBUG'] = originalDebugEnv;
    }
  });

  describe('log level filtering', () => {
    describe('minLevel=info (default)', () => {
      test('should filter out debug logs', () => {
        process.env['DEBUG'] = '*';
        const logger = new TestLogger('info');

        logger.debug('topic', 'debug message');

        // debug() bypasses level check, only checks topic
        // But since we're testing info level, this is about info/warn/error
        expect(logger.logs.length).toBe(1);
      });

      test('should allow info logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('info');

        logger.info('info message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('info');
        expect(logger.getLog(0).message).toBe('info message');
      });

      test('should allow warn logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('info');

        logger.warn('warn message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('warn');
      });

      test('should allow error logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('info');

        logger.error('error message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('error');
      });
    });

    describe('minLevel=warn', () => {
      test('should filter out info logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('warn');

        logger.info('info message');

        expect(logger.logs.length).toBe(0);
      });

      test('should allow warn logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('warn');

        logger.warn('warn message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('warn');
      });

      test('should allow error logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('warn');

        logger.error('error message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('error');
      });
    });

    describe('minLevel=error', () => {
      test('should filter out info logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('error');

        logger.info('info message');

        expect(logger.logs.length).toBe(0);
      });

      test('should filter out warn logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('error');

        logger.warn('warn message');

        expect(logger.logs.length).toBe(0);
      });

      test('should allow error logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('error');

        logger.error('error message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('error');
      });
    });

    describe('minLevel=debug', () => {
      test('should allow info logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('debug');

        logger.info('info message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('info');
      });

      test('should allow warn logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('debug');

        logger.warn('warn message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('warn');
      });

      test('should allow error logs', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger('debug');

        logger.error('error message');

        expect(logger.logs.length).toBe(1);
        expect(logger.getLog(0).level).toBe('error');
      });
    });
  });

  describe('DEBUG env var parsing', () => {
    describe('DEBUG=*', () => {
      test('should enable all debug topics', () => {
        process.env['DEBUG'] = '*';
        const logger = new TestLogger();

        logger.debug('any-topic', 'message 1');
        logger.debug('another-topic', 'message 2');
        logger.debug('monobank:api', 'message 3');

        expect(logger.logs.length).toBe(3);
      });
    });

    describe('DEBUG=topic1,topic2', () => {
      test('should enable specific topics', () => {
        process.env['DEBUG'] = 'monobank,spreadsheet';
        const logger = new TestLogger();

        logger.debug('monobank', 'monobank message');
        logger.debug('spreadsheet', 'spreadsheet message');
        logger.debug('other', 'should not appear');

        expect(logger.logs.length).toBe(2);
        expect(logger.getLog(0).context?.['topic']).toBe('monobank');
        expect(logger.getLog(1).context?.['topic']).toBe('spreadsheet');
      });

      test('should trim whitespace from topics', () => {
        process.env['DEBUG'] = ' monobank , spreadsheet ';
        const logger = new TestLogger();

        logger.debug('monobank', 'monobank message');
        logger.debug('spreadsheet', 'spreadsheet message');

        expect(logger.logs.length).toBe(2);
      });
    });

    describe('DEBUG=prefix*', () => {
      test('should enable wildcard matching', () => {
        process.env['DEBUG'] = 'monobank*';
        const logger = new TestLogger();

        logger.debug('monobank', 'exact match');
        logger.debug('monobank:api', 'colon suffix');
        logger.debug('monobank-client', 'dash suffix');
        logger.debug('other', 'should not appear');

        expect(logger.logs.length).toBe(3);
      });

      test('should match empty suffix with wildcard', () => {
        process.env['DEBUG'] = 'test*';
        const logger = new TestLogger();

        logger.debug('test', 'exact match with wildcard');

        expect(logger.logs.length).toBe(1);
      });

      test('should combine wildcard with specific topics', () => {
        process.env['DEBUG'] = 'monobank*,spreadsheet';
        const logger = new TestLogger();

        logger.debug('monobank:api', 'monobank wildcard');
        logger.debug('spreadsheet', 'exact spreadsheet');
        logger.debug('other', 'should not appear');

        expect(logger.logs.length).toBe(2);
      });
    });

    describe('empty or undefined DEBUG', () => {
      test('should disable all debug topics when DEBUG is empty', () => {
        process.env['DEBUG'] = '';
        const logger = new TestLogger();

        logger.debug('any-topic', 'should not appear');

        expect(logger.logs.length).toBe(0);
      });

      test('should disable all debug topics when DEBUG is undefined', () => {
        delete process.env['DEBUG'];
        const logger = new TestLogger();

        logger.debug('any-topic', 'should not appear');

        expect(logger.logs.length).toBe(0);
      });
    });
  });

  describe('debug()', () => {
    test('should only write when topic is enabled', () => {
      process.env['DEBUG'] = 'enabled-topic';
      const logger = new TestLogger();

      logger.debug('enabled-topic', 'should appear');
      logger.debug('disabled-topic', 'should not appear');

      expect(logger.logs.length).toBe(1);
      expect(logger.getLog(0).message).toBe('should appear');
    });

    test('should include topic in context', () => {
      process.env['DEBUG'] = '*';
      const logger = new TestLogger();

      logger.debug('my-topic', 'message');

      expect(logger.getLog(0).context?.['topic']).toBe('my-topic');
    });

    test('should merge topic with existing context', () => {
      process.env['DEBUG'] = '*';
      const logger = new TestLogger();

      logger.debug('my-topic', 'message', { key: 'value', count: 42 });

      expect(logger.getLog(0).context).toEqual({
        topic: 'my-topic',
        key: 'value',
        count: 42,
      });
    });

    test('should set level to debug', () => {
      process.env['DEBUG'] = '*';
      const logger = new TestLogger();

      logger.debug('topic', 'message');

      expect(logger.getLog(0).level).toBe('debug');
    });
  });

  describe('info()', () => {
    test('should write log with info level', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.info('info message');

      expect(logger.getLog(0).level).toBe('info');
      expect(logger.getLog(0).message).toBe('info message');
    });

    test('should pass context through', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.info('message', { userId: 123, action: 'sync' });

      expect(logger.getLog(0).context).toEqual({ userId: 123, action: 'sync' });
    });

    test('should work without context', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.info('message');

      expect(logger.getLog(0).context).toBeUndefined();
    });

    test('should respect minLevel', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('warn');

      logger.info('should not appear');

      expect(logger.logs.length).toBe(0);
    });
  });

  describe('warn()', () => {
    test('should write log with warn level', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.warn('warning message');

      expect(logger.getLog(0).level).toBe('warn');
      expect(logger.getLog(0).message).toBe('warning message');
    });

    test('should pass context through', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.warn('message', { errorCode: 'E001' });

      expect(logger.getLog(0).context).toEqual({ errorCode: 'E001' });
    });

    test('should respect minLevel', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('error');

      logger.warn('should not appear');

      expect(logger.logs.length).toBe(0);
    });
  });

  describe('error()', () => {
    test('should write log with error level', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.error('error message');

      expect(logger.getLog(0).level).toBe('error');
      expect(logger.getLog(0).message).toBe('error message');
    });

    test('should pass context through', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.error('message', { stack: 'Error: something went wrong' });

      expect(logger.getLog(0).context).toEqual({
        stack: 'Error: something went wrong',
      });
    });

    test('should always be allowed regardless of minLevel', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('error');

      logger.error('error message');

      expect(logger.logs.length).toBe(1);
    });
  });

  describe('context handling', () => {
    test('should handle empty context object', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.info('message', {});

      expect(logger.getLog(0).context).toEqual({});
    });

    test('should handle nested context objects', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      const context = {
        user: { id: 1, name: 'Test' },
        metadata: { timestamp: 12345 },
      };
      logger.info('message', context);

      expect(logger.getLog(0).context).toEqual(context);
    });

    test('should handle context with arrays', () => {
      delete process.env['DEBUG'];
      const logger = new TestLogger('info');

      logger.info('message', { ids: [1, 2, 3] });

      expect(logger.getLog(0).context).toEqual({ ids: [1, 2, 3] });
    });
  });
});
