const { LogLevel, LogEntry } = require('../lib/logging/LogEntry');

describe('LogLevel', () => {
  test('defines TRACE level', () => {
    expect(LogLevel.TRACE).toBe('trace');
  });

  test('defines DEBUG level', () => {
    expect(LogLevel.DEBUG).toBe('debug');
  });

  test('defines INFO level', () => {
    expect(LogLevel.INFO).toBe('info');
  });

  test('defines WARN level', () => {
    expect(LogLevel.WARN).toBe('warn');
  });

  test('defines ERROR level', () => {
    expect(LogLevel.ERROR).toBe('error');
  });

  test('defines FATAL level', () => {
    expect(LogLevel.FATAL).toBe('fatal');
  });

  test('has exactly 6 levels', () => {
    expect(Object.keys(LogLevel)).toHaveLength(6);
  });
});

describe('LogEntry', () => {
  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    test('sets message from options', () => {
      const entry = new LogEntry({ message: 'hello' });
      expect(entry.message).toBe('hello');
    });

    test('defaults level to INFO', () => {
      const entry = new LogEntry({ message: 'test' });
      expect(entry.level).toBe(LogLevel.INFO);
    });

    test('accepts custom level', () => {
      const entry = new LogEntry({ message: 'err', level: LogLevel.ERROR });
      expect(entry.level).toBe('error');
    });

    test('defaults timestamp to current Date', () => {
      const before = new Date();
      const entry = new LogEntry({ message: 'test' });
      const after = new Date();
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('accepts custom timestamp', () => {
      const ts = new Date('2024-06-01T12:00:00.000Z');
      const entry = new LogEntry({ message: 'test', timestamp: ts });
      expect(entry.timestamp).toBe(ts);
    });

    test('defaults metadata to null', () => {
      const entry = new LogEntry({ message: 'test' });
      expect(entry.metadata).toBeNull();
    });

    test('accepts custom metadata', () => {
      const entry = new LogEntry({ message: 'test', metadata: { key: 'value' } });
      expect(entry.metadata).toEqual({ key: 'value' });
    });

    test('defaults userId to null', () => {
      const entry = new LogEntry({ message: 'test' });
      expect(entry.userId).toBeNull();
    });

    test('accepts custom userId', () => {
      const entry = new LogEntry({ message: 'test', userId: 'user-123' });
      expect(entry.userId).toBe('user-123');
    });
  });

  // ─── toJSON ───────────────────────────────────────────────────────

  describe('toJSON()', () => {
    test('returns correct base fields', () => {
      const ts = new Date('2024-06-01T12:00:00.000Z');
      const entry = new LogEntry({ message: 'log msg', level: LogLevel.WARN, timestamp: ts });
      const json = entry.toJSON();

      expect(json.message).toBe('log msg');
      expect(json.level).toBe('warn');
      expect(json.timestamp).toBe('2024-06-01T12:00:00.000Z');
    });

    test('includes metadata when present', () => {
      const entry = new LogEntry({ message: 'x', metadata: { foo: 'bar' } });
      const json = entry.toJSON();
      expect(json.metadata).toEqual({ foo: 'bar' });
    });

    test('omits metadata when null', () => {
      const entry = new LogEntry({ message: 'x' });
      const json = entry.toJSON();
      expect(json.metadata).toBeUndefined();
    });

    test('includes userId when present', () => {
      const entry = new LogEntry({ message: 'x', userId: 'u42' });
      const json = entry.toJSON();
      expect(json.userId).toBe('u42');
    });

    test('omits userId when null', () => {
      const entry = new LogEntry({ message: 'x' });
      const json = entry.toJSON();
      expect(json.userId).toBeUndefined();
    });

    test('converts timestamp to ISO string', () => {
      const entry = new LogEntry({ message: 'x' });
      const json = entry.toJSON();
      expect(typeof json.timestamp).toBe('string');
      expect(() => new Date(json.timestamp)).not.toThrow();
    });

    test('works with all log levels', () => {
      for (const [, value] of Object.entries(LogLevel)) {
        const entry = new LogEntry({ message: 'test', level: value });
        expect(entry.toJSON().level).toBe(value);
      }
    });
  });
});
