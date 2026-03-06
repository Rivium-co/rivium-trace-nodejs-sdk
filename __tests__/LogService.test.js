const { LogService } = require('../lib/logging/LogService');
const { LogEntry, LogLevel } = require('../lib/logging/LogEntry');

// We mock _sendRequest to avoid real network calls
function createService(overrides = {}) {
  const svc = new LogService({
    apiKey: 'rv_live_test123',
    sourceId: overrides.sourceId !== undefined ? overrides.sourceId : 'src-1',
    sourceName: overrides.sourceName || 'test-source',
    platform: 'nodejs',
    environment: 'test',
    release: '1.0.0',
    batchSize: overrides.batchSize || 5,
    flushIntervalMs: overrides.flushIntervalMs || 30000,
    maxBufferSize: overrides.maxBufferSize || 20,
    debug: overrides.debug || false,
    ...overrides,
  });
  // Mock _sendRequest to always succeed (or fail as configured)
  svc._sendRequest = jest.fn().mockResolvedValue(true);
  return svc;
}

describe('LogService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    test('initializes with empty buffer', () => {
      const svc = createService();
      expect(svc.bufferSize).toBe(0);
    });

    test('sets default batchSize to 50 when not overridden', () => {
      const svc = new LogService({ apiKey: 'rv_live_x' });
      expect(svc.batchSize).toBe(50);
    });

    test('sets default flushIntervalMs to 30000', () => {
      const svc = new LogService({ apiKey: 'rv_live_x' });
      expect(svc.flushIntervalMs).toBe(30000);
    });

    test('sets default maxBufferSize to 1000', () => {
      const svc = new LogService({ apiKey: 'rv_live_x' });
      expect(svc.maxBufferSize).toBe(1000);
    });

    test('stores apiKey', () => {
      const svc = createService();
      expect(svc.apiKey).toBe('rv_live_test123');
    });

    test('initializes retryAttempt to 0', () => {
      const svc = createService();
      expect(svc.retryAttempt).toBe(0);
    });
  });

  // ─── add() ────────────────────────────────────────────────────────

  describe('add()', () => {
    test('adds a LogEntry to the buffer', () => {
      const svc = createService();
      svc.add(new LogEntry({ message: 'test' }));
      expect(svc.bufferSize).toBe(1);
    });

    test('wraps plain object in LogEntry', () => {
      const svc = createService();
      svc.add({ message: 'plain', level: LogLevel.WARN });
      expect(svc.bufferSize).toBe(1);
    });

    test('triggers flush when buffer reaches batchSize', async () => {
      const svc = createService({ batchSize: 3 });
      const flushSpy = jest.spyOn(svc, 'flush');

      svc.add(new LogEntry({ message: 'a' }));
      svc.add(new LogEntry({ message: 'b' }));
      svc.add(new LogEntry({ message: 'c' }));

      expect(flushSpy).toHaveBeenCalled();
      flushSpy.mockRestore();
    });

    test('schedules flush timer when below batchSize', () => {
      const svc = createService({ batchSize: 10 });
      svc.add(new LogEntry({ message: 'a' }));
      expect(svc.flushTimer).not.toBeNull();
    });

    test('does not schedule duplicate timers', () => {
      const svc = createService({ batchSize: 10 });
      svc.add(new LogEntry({ message: 'a' }));
      const timer1 = svc.flushTimer;
      svc.add(new LogEntry({ message: 'b' }));
      // Timer should remain the same (not replaced)
      expect(svc.flushTimer).toBe(timer1);
    });
  });

  // ─── log() convenience ───────────────────────────────────────────

  describe('log()', () => {
    test('adds entry with message, level, metadata, userId', () => {
      const svc = createService();
      svc.log('hello', LogLevel.ERROR, { key: 'val' }, 'user-1');
      expect(svc.bufferSize).toBe(1);
      expect(svc.buffer[0].message).toBe('hello');
      expect(svc.buffer[0].level).toBe(LogLevel.ERROR);
      expect(svc.buffer[0].metadata).toEqual({ key: 'val' });
      expect(svc.buffer[0].userId).toBe('user-1');
    });

    test('defaults level to INFO', () => {
      const svc = createService();
      svc.log('msg');
      expect(svc.buffer[0].level).toBe(LogLevel.INFO);
    });
  });

  // ─── Buffer Management ───────────────────────────────────────────

  describe('buffer management', () => {
    test('enforces maxBufferSize by dropping oldest logs', () => {
      const svc = createService({ maxBufferSize: 5, batchSize: 100 });
      for (let i = 0; i < 10; i++) {
        svc.add(new LogEntry({ message: `msg-${i}` }));
      }
      expect(svc.bufferSize).toBe(5);
      expect(svc.buffer[0].message).toBe('msg-5');
      expect(svc.buffer[4].message).toBe('msg-9');
    });

    test('bufferSize getter returns current count', () => {
      const svc = createService();
      expect(svc.bufferSize).toBe(0);
      svc.add(new LogEntry({ message: 'a' }));
      expect(svc.bufferSize).toBe(1);
    });
  });

  // ─── flush() ──────────────────────────────────────────────────────

  describe('flush()', () => {
    test('returns true when buffer is empty', async () => {
      const svc = createService();
      const result = await svc.flush();
      expect(result).toBe(true);
    });

    test('returns true when already flushing', async () => {
      const svc = createService();
      svc.isFlushing = true;
      const result = await svc.flush();
      expect(result).toBe(true);
    });

    test('sends batch request when sourceId is set', async () => {
      const svc = createService({ sourceId: 'src-1' });
      svc.add(new LogEntry({ message: 'a' }));
      svc.add(new LogEntry({ message: 'b' }));

      await svc.flush();

      expect(svc._sendRequest).toHaveBeenCalledWith(
        '/api/logs/ingest/batch',
        expect.objectContaining({
          sourceId: 'src-1',
          sourceType: 'sdk',
          logs: expect.any(Array),
        })
      );
    });

    test('sends individual requests when sourceId is null', async () => {
      const svc = createService({ sourceId: null });
      svc.add(new LogEntry({ message: 'a' }));
      svc.add(new LogEntry({ message: 'b' }));

      await svc.flush();

      // Should have called sendImmediate for each entry
      expect(svc._sendRequest).toHaveBeenCalledTimes(2);
      expect(svc._sendRequest).toHaveBeenCalledWith(
        '/api/logs/ingest',
        expect.objectContaining({ message: 'a' })
      );
    });

    test('clears buffer after successful flush', async () => {
      const svc = createService();
      svc.add(new LogEntry({ message: 'a' }));
      await svc.flush();
      expect(svc.bufferSize).toBe(0);
    });

    test('resets retryAttempt on successful batch flush', async () => {
      const svc = createService();
      svc.retryAttempt = 3;
      svc.add(new LogEntry({ message: 'a' }));
      await svc.flush();
      expect(svc.retryAttempt).toBe(0);
    });

    test('puts logs back in buffer on failed batch flush', async () => {
      const svc = createService();
      svc._sendRequest.mockResolvedValue(false);
      svc.add(new LogEntry({ message: 'a' }));
      svc.add(new LogEntry({ message: 'b' }));

      await svc.flush();

      expect(svc.bufferSize).toBe(2);
    });

    test('increments retryAttempt on failed flush', async () => {
      const svc = createService();
      svc._sendRequest.mockResolvedValue(false);
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      expect(svc.retryAttempt).toBe(1);
    });

    test('resets retryAttempt after reaching max retry attempts on failure', async () => {
      const svc = createService();
      svc._sendRequest.mockResolvedValue(false);
      svc.retryAttempt = 10; // at maxRetryAttempts
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      expect(svc.retryAttempt).toBe(0);
    });

    test('puts logs back in buffer on exception during flush', async () => {
      const svc = createService();
      svc._sendRequest.mockRejectedValue(new Error('network failure'));
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      expect(svc.bufferSize).toBe(1);
      expect(svc.retryAttempt).toBe(1);
    });

    test('cancels pending flush timer', async () => {
      const svc = createService({ batchSize: 10 });
      svc.add(new LogEntry({ message: 'a' }));
      expect(svc.flushTimer).not.toBeNull();

      await svc.flush();

      expect(svc.flushTimer).toBeNull();
    });

    test('batch payload includes platform and environment', async () => {
      const svc = createService({ sourceId: 'src-1' });
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      const payload = svc._sendRequest.mock.calls[0][1];
      expect(payload.logs[0]).toHaveProperty('platform', 'nodejs');
      expect(payload.logs[0]).toHaveProperty('environment', 'test');
    });

    test('batch payload includes sourceName when set', async () => {
      const svc = createService({ sourceId: 'src-1', sourceName: 'my-app' });
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      const payload = svc._sendRequest.mock.calls[0][1];
      expect(payload.sourceName).toBe('my-app');
    });

    test('batch payload includes release when set', async () => {
      const svc = createService({ sourceId: 'src-1' });
      svc.add(new LogEntry({ message: 'a' }));

      await svc.flush();

      const payload = svc._sendRequest.mock.calls[0][1];
      expect(payload.logs[0]).toHaveProperty('release', '1.0.0');
    });
  });

  // ─── _getRetryDelay ──────────────────────────────────────────────

  describe('_getRetryDelay()', () => {
    test('returns base delay for first retry', () => {
      const svc = createService();
      svc.retryAttempt = 0;
      expect(svc._getRetryDelay()).toBe(1000);
    });

    test('doubles with each retry attempt', () => {
      const svc = createService();
      svc.retryAttempt = 1;
      expect(svc._getRetryDelay()).toBe(2000);
      svc.retryAttempt = 2;
      expect(svc._getRetryDelay()).toBe(4000);
      svc.retryAttempt = 3;
      expect(svc._getRetryDelay()).toBe(8000);
    });

    test('caps at maxRetryDelayMs (60000)', () => {
      const svc = createService();
      svc.retryAttempt = 20;
      expect(svc._getRetryDelay()).toBe(60000);
    });
  });

  // ─── _scheduleFlush ──────────────────────────────────────────────

  describe('_scheduleFlush()', () => {
    test('does not schedule when buffer is empty', () => {
      const svc = createService();
      svc._scheduleFlush();
      expect(svc.flushTimer).toBeNull();
    });

    test('schedules with normal interval when retryAttempt is 0', () => {
      const svc = createService({ flushIntervalMs: 5000 });
      svc.buffer.push(new LogEntry({ message: 'x' }));
      svc._scheduleFlush();
      expect(svc.flushTimer).not.toBeNull();
    });

    test('uses backoff delay when retrying', () => {
      const svc = createService();
      svc.retryAttempt = 2;
      svc.buffer.push(new LogEntry({ message: 'x' }));

      const flushSpy = jest.spyOn(svc, 'flush').mockResolvedValue(true);
      svc._scheduleFlush();

      // Backoff delay for attempt 2 = 1000 * 2^2 = 4000ms
      jest.advanceTimersByTime(3999);
      expect(flushSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(flushSpy).toHaveBeenCalled();

      flushSpy.mockRestore();
    });

    test('cancels existing timer before scheduling new one', () => {
      const svc = createService();
      svc.buffer.push(new LogEntry({ message: 'x' }));
      svc._scheduleFlush();
      const timer1 = svc.flushTimer;

      svc._scheduleFlush();
      // Timer should be different (old one was cleared, new one set)
      expect(svc.flushTimer).not.toBe(timer1);
    });
  });

  // ─── sendImmediate ────────────────────────────────────────────────

  describe('sendImmediate()', () => {
    test('sends single entry to /api/logs/ingest', async () => {
      const svc = createService();
      const entry = new LogEntry({ message: 'immediate' });

      await svc.sendImmediate(entry);

      expect(svc._sendRequest).toHaveBeenCalledWith(
        '/api/logs/ingest',
        expect.objectContaining({
          message: 'immediate',
          platform: 'nodejs',
          environment: 'test',
          sourceType: 'sdk',
        })
      );
    });

    test('includes release in payload when set', async () => {
      const svc = createService();
      const entry = new LogEntry({ message: 'x' });

      await svc.sendImmediate(entry);

      const payload = svc._sendRequest.mock.calls[0][1];
      expect(payload.release).toBe('1.0.0');
    });

    test('includes sourceId and sourceName when set', async () => {
      const svc = createService({ sourceId: 'src-42', sourceName: 'my-svc' });
      const entry = new LogEntry({ message: 'x' });

      await svc.sendImmediate(entry);

      const payload = svc._sendRequest.mock.calls[0][1];
      expect(payload.sourceId).toBe('src-42');
      expect(payload.sourceName).toBe('my-svc');
    });
  });

  // ─── dispose ──────────────────────────────────────────────────────

  describe('dispose()', () => {
    test('clears flush timer', async () => {
      const svc = createService({ batchSize: 100 });
      svc.add(new LogEntry({ message: 'a' }));
      expect(svc.flushTimer).not.toBeNull();

      await svc.dispose();

      expect(svc.flushTimer).toBeNull();
    });

    test('flushes remaining buffer', async () => {
      const svc = createService({ batchSize: 100 });
      svc.add(new LogEntry({ message: 'a' }));
      svc.add(new LogEntry({ message: 'b' }));

      await svc.dispose();

      expect(svc._sendRequest).toHaveBeenCalled();
      expect(svc.bufferSize).toBe(0);
    });
  });

  // ─── Timer-based flush ───────────────────────────────────────────

  describe('timer-based flush', () => {
    test('flushes on timer expiry', async () => {
      const svc = createService({ batchSize: 100, flushIntervalMs: 5000 });
      svc.add(new LogEntry({ message: 'timed' }));

      jest.advanceTimersByTime(5000);

      // Wait for the async flush promise to resolve
      await Promise.resolve();

      expect(svc._sendRequest).toHaveBeenCalled();
    });
  });
});
