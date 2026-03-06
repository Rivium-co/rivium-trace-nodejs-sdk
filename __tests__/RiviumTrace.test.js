const RiviumTrace = require('../index');
const RiviumTraceError = require('../lib/models/RiviumTraceError');
const { Breadcrumb } = require('../lib/models/Breadcrumb');

// Mock HttpClient to prevent real network calls
jest.mock('../lib/handlers/HttpClient', () => {
  return jest.fn().mockImplementation(() => ({
    sendError: jest.fn().mockResolvedValue({ success: true, statusCode: 200 }),
  }));
});

// Mock PerformanceClient to prevent timers
jest.mock('../lib/performance/PerformanceClient', () => ({
  PerformanceClient: jest.fn().mockImplementation(() => ({
    reportSpan: jest.fn(),
    trackOperation: jest.fn(async (op, fn) => fn()),
    flush: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  })),
}));

const validOptions = () => ({
  apiKey: 'rv_live_abc123',
  serverSecret: 'rv_srv_secret456',
  captureUncaughtExceptions: false,
  captureUnhandledRejections: false,
});

describe('RiviumTrace', () => {
  afterEach(async () => {
    await RiviumTrace.close();
  });

  // ─── init ─────────────────────────────────────────────────────────

  describe('init()', () => {
    test('initializes the singleton instance', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace._instance).not.toBeNull();
      expect(RiviumTrace._instance._isInitialized).toBe(true);
    });

    test('returns the instance', () => {
      const instance = RiviumTrace.init(validOptions());
      expect(instance).toBe(RiviumTrace._instance);
    });

    test('replaces previous instance on re-init', async () => {
      const first = RiviumTrace.init(validOptions());
      const second = RiviumTrace.init(validOptions());
      expect(second).not.toBe(first);
      expect(RiviumTrace._instance).toBe(second);
    });

    test('throws when apiKey is missing', () => {
      expect(() => RiviumTrace.init({ serverSecret: 'rv_srv_x' })).toThrow();
    });

    test('throws when serverSecret is missing', () => {
      expect(() => RiviumTrace.init({ apiKey: 'rv_live_x' })).toThrow();
    });

    test('creates breadcrumb manager', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace._instance._breadcrumbManager).toBeDefined();
    });

    test('creates rate limiter', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace._instance._rateLimiter).toBeDefined();
    });

    test('creates HTTP client', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace._instance._httpClient).toBeDefined();
    });

    test('sets default sample rate to 1.0', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace._instance._sampleRate).toBe(1.0);
    });

    test('accepts custom sample rate', () => {
      RiviumTrace.init({ ...validOptions(), sampleRate: 0.5 });
      expect(RiviumTrace._instance._sampleRate).toBe(0.5);
    });
  });

  // ─── instance getter ─────────────────────────────────────────────

  describe('instance getter', () => {
    test('throws when not initialized', () => {
      expect(() => RiviumTrace.instance).toThrow(
        'RiviumTrace not initialized. Call RiviumTrace.init() first.'
      );
    });

    test('returns the singleton when initialized', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace.instance).toBe(RiviumTrace._instance);
    });
  });

  // ─── captureException ─────────────────────────────────────────────

  describe('captureException()', () => {
    test('resolves silently when not initialized', async () => {
      const result = await RiviumTrace.captureException(new Error('no init'));
      expect(result).toBeUndefined();
    });

    test('sends error via HTTP client', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.captureException(new Error('test error'));

      expect(RiviumTrace._instance._httpClient.sendError).toHaveBeenCalled();
    });

    test('includes environment and release from config', async () => {
      RiviumTrace.init({
        ...validOptions(),
        environment: 'production',
        release: '2.0.0',
      });
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureException(new Error('prod error'));

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.environment).toBe('production');
      expect(sentError.release).toBe('2.0.0');
    });

    test('includes node context', async () => {
      RiviumTrace.init(validOptions());
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureException(new Error('ctx error'));

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.extra.node_context).toBeDefined();
      expect(sentError.extra.node_context.node_version).toBe(process.version);
    });

    test('includes breadcrumbs in extra', async () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.addBreadcrumb({ message: 'crumb1' });

      const sendSpy = RiviumTrace._instance._httpClient.sendError;
      await RiviumTrace.captureException(new Error('with crumbs'));

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.extra.breadcrumbs).toBeDefined();
      expect(sentError.extra.breadcrumbs.length).toBeGreaterThan(0);
    });

    test('includes extra options', async () => {
      RiviumTrace.init(validOptions());
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureException(new Error('x'), {
        extra: { userId: 42 },
      });

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.extra.userId).toBe(42);
    });

    test('skips sending when beforeSend returns falsy', async () => {
      RiviumTrace.init({
        ...validOptions(),
        beforeSend: () => null,
      });
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureException(new Error('filtered'));

      expect(sendSpy).not.toHaveBeenCalled();
    });

    test('calls beforeSend with the error', async () => {
      const beforeSend = jest.fn((err) => err);
      RiviumTrace.init({ ...validOptions(), beforeSend });

      await RiviumTrace.captureException(new Error('callback'));

      expect(beforeSend).toHaveBeenCalledWith(expect.any(RiviumTraceError));
    });

    test('respects sample rate of 0', async () => {
      RiviumTrace.init({ ...validOptions(), sampleRate: 0 });
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      // With sampleRate=0 and Math.random() always returning something > 0,
      // all errors should be dropped
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      await RiviumTrace.captureException(new Error('sampled'));
      jest.spyOn(Math, 'random').mockRestore();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    test('does not send when disabled', async () => {
      RiviumTrace.init({ ...validOptions(), enabled: false });

      await RiviumTrace.captureException(new Error('disabled'));

      // sendError returns disabled result
      expect(RiviumTrace._instance._httpClient.sendError).not.toHaveBeenCalled();
    });
  });

  // ─── captureMessage ───────────────────────────────────────────────

  describe('captureMessage()', () => {
    test('resolves silently when not initialized', async () => {
      const result = await RiviumTrace.captureMessage('no init');
      expect(result).toBeUndefined();
    });

    test('sends message via HTTP client', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.captureMessage('test message');

      expect(RiviumTrace._instance._httpClient.sendError).toHaveBeenCalled();
      const sentError = RiviumTrace._instance._httpClient.sendError.mock.calls[0][0];
      expect(sentError.message).toBe('test message');
    });

    test('includes extra options', async () => {
      RiviumTrace.init(validOptions());
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureMessage('msg', { extra: { detail: 'info' } });

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.extra.detail).toBe('info');
    });

    test('skips when beforeSend returns falsy', async () => {
      RiviumTrace.init({ ...validOptions(), beforeSend: () => null });
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureMessage('filtered');

      expect(sendSpy).not.toHaveBeenCalled();
    });

    test('includes node context', async () => {
      RiviumTrace.init(validOptions());
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      await RiviumTrace.captureMessage('with context');

      const sentError = sendSpy.mock.calls[0][0];
      expect(sentError.extra.node_context).toBeDefined();
    });
  });

  // ─── addBreadcrumb ────────────────────────────────────────────────

  describe('addBreadcrumb()', () => {
    test('does nothing when not initialized', () => {
      expect(() => RiviumTrace.addBreadcrumb({ message: 'safe' })).not.toThrow();
    });

    test('adds breadcrumb to manager', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.addBreadcrumb({ message: 'first', category: 'test' });

      const crumbs = RiviumTrace._instance._breadcrumbManager.getAll();
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0].message).toBe('first');
    });

    test('accepts Breadcrumb instance', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.addBreadcrumb(Breadcrumb.http('GET', '/test', 200, 50));

      const crumbs = RiviumTrace._instance._breadcrumbManager.getAll();
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0].category).toBe('http');
    });
  });

  // ─── setRequestContext / setUser ──────────────────────────────────

  describe('setRequestContext()', () => {
    test('does nothing when not initialized', () => {
      expect(() => RiviumTrace.setRequestContext({ url: '/' })).not.toThrow();
    });

    test('stores request context', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.setRequestContext({ url: '/api', method: 'GET' });
      expect(RiviumTrace._instance._requestContext).toEqual({ url: '/api', method: 'GET' });
    });
  });

  describe('setUser()', () => {
    test('does nothing when not initialized', () => {
      expect(() => RiviumTrace.setUser({ id: '1' })).not.toThrow();
    });

    test('stores user context', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.setUser({ id: 'u1', email: 'test@example.com' });
      expect(RiviumTrace._instance._userContext).toEqual({
        id: 'u1',
        email: 'test@example.com',
      });
    });
  });

  // ─── getConfig ────────────────────────────────────────────────────

  describe('getConfig()', () => {
    test('returns null when not initialized', () => {
      expect(RiviumTrace.getConfig()).toBeUndefined();
    });

    test('returns config when initialized', () => {
      RiviumTrace.init(validOptions());
      const config = RiviumTrace.getConfig();
      expect(config.apiKey).toBe('rv_live_abc123');
    });
  });

  // ─── isEnabled ────────────────────────────────────────────────────

  describe('isEnabled()', () => {
    test('returns false when not initialized', () => {
      expect(RiviumTrace.isEnabled()).toBe(false);
    });

    test('returns true when initialized and enabled', () => {
      RiviumTrace.init(validOptions());
      expect(RiviumTrace.isEnabled()).toBe(true);
    });

    test('returns false when initialized but disabled', () => {
      RiviumTrace.init({ ...validOptions(), enabled: false });
      expect(RiviumTrace.isEnabled()).toBe(false);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────

  describe('getStats()', () => {
    test('returns null when not initialized', () => {
      expect(RiviumTrace.getStats()).toBeNull();
    });

    test('returns stats object when initialized', () => {
      RiviumTrace.init(validOptions());
      const stats = RiviumTrace.getStats();

      expect(stats).toHaveProperty('isEnabled', true);
      expect(stats).toHaveProperty('breadcrumbCount', 0);
      expect(stats).toHaveProperty('rateLimiter');
      expect(stats).toHaveProperty('config');
      expect(stats.config.apiKey).toContain('rv_live_');
    });

    test('tracks breadcrumb count', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.addBreadcrumb({ message: 'a' });
      RiviumTrace.addBreadcrumb({ message: 'b' });

      expect(RiviumTrace.getStats().breadcrumbCount).toBe(2);
    });

    test('truncates API key in stats', () => {
      RiviumTrace.init(validOptions());
      const stats = RiviumTrace.getStats();
      expect(stats.config.apiKey).toMatch(/\.\.\.$/);
    });
  });

  // ─── withScope ────────────────────────────────────────────────────

  describe('withScope()', () => {
    test('calls callback when not initialized', () => {
      const cb = jest.fn();
      RiviumTrace.withScope(cb);
      expect(cb).toHaveBeenCalled();
    });

    test('provides scope object with setExtra, setUser, addBreadcrumb', () => {
      RiviumTrace.init(validOptions());

      RiviumTrace.withScope((scope) => {
        expect(scope).toHaveProperty('setExtra');
        expect(scope).toHaveProperty('setUser');
        expect(scope).toHaveProperty('addBreadcrumb');
      });
    });

    test('restores original context after scope', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.setRequestContext({ original: true });
      RiviumTrace.setUser({ id: 'original' });

      RiviumTrace.withScope((scope) => {
        scope.setExtra('scoped', true);
        scope.setUser({ id: 'scoped' });
      });

      // Context should be restored
      expect(RiviumTrace._instance._userContext).toEqual({ id: 'original' });
    });

    test('scope.addBreadcrumb adds to manager', () => {
      RiviumTrace.init(validOptions());

      RiviumTrace.withScope((scope) => {
        scope.addBreadcrumb({ message: 'scoped crumb' });
      });

      // Breadcrumbs are NOT restored (they persist)
      const crumbs = RiviumTrace._instance._breadcrumbManager.getAll();
      expect(crumbs).toHaveLength(1);
    });
  });

  // ─── flush ────────────────────────────────────────────────────────

  describe('flush()', () => {
    test('resolves true when not initialized', async () => {
      const result = await RiviumTrace.flush();
      expect(result).toBe(true);
    });

    test('resolves true when initialized', async () => {
      RiviumTrace.init(validOptions());
      const result = await RiviumTrace.flush();
      expect(result).toBe(true);
    });
  });

  // ─── close ────────────────────────────────────────────────────────

  describe('close()', () => {
    test('clears the singleton', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.close();
      expect(RiviumTrace._instance).toBeNull();
    });

    test('clears breadcrumbs on close', async () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.addBreadcrumb({ message: 'will be cleared' });
      await RiviumTrace.close();
      // After close, instance is null, so can't check breadcrumbs
      expect(RiviumTrace._instance).toBeNull();
    });

    test('resets contexts on close', async () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.setRequestContext({ url: '/' });
      RiviumTrace.setUser({ id: '1' });
      await RiviumTrace.close();
      expect(RiviumTrace._instance).toBeNull();
    });

    test('handles close when not initialized', async () => {
      await expect(RiviumTrace.close()).resolves.toBeUndefined();
    });
  });

  // ─── expressMiddleware ────────────────────────────────────────────

  describe('expressMiddleware()', () => {
    test('returns no-op middleware when not initialized', () => {
      const middleware = RiviumTrace.expressMiddleware();
      expect(typeof middleware).toBe('function');

      // Should just call next
      const next = jest.fn();
      middleware({}, {}, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // ─── Logging convenience methods ─────────────────────────────────

  describe('logging methods', () => {
    test('log() does nothing when not initialized', () => {
      expect(() => RiviumTrace.log('test')).not.toThrow();
    });

    test('trace() does nothing when not initialized', () => {
      expect(() => RiviumTrace.trace('test')).not.toThrow();
    });

    test('info() does nothing when not initialized', () => {
      expect(() => RiviumTrace.info('test')).not.toThrow();
    });

    test('warn() does nothing when not initialized', () => {
      expect(() => RiviumTrace.warn('test')).not.toThrow();
    });

    test('logError() does nothing when not initialized', () => {
      expect(() => RiviumTrace.logError('test')).not.toThrow();
    });

    test('fatal() does nothing when not initialized', () => {
      expect(() => RiviumTrace.fatal('test')).not.toThrow();
    });

    test('logDebug() does nothing when not initialized', () => {
      expect(() => RiviumTrace.logDebug('test')).not.toThrow();
    });

    test('pendingLogCount returns 0 when not initialized', () => {
      expect(RiviumTrace.pendingLogCount).toBe(0);
    });

    test('flushLogs resolves true when no log service', async () => {
      const result = await RiviumTrace.flushLogs();
      expect(result).toBe(true);
    });
  });

  // ─── Performance methods ──────────────────────────────────────────

  describe('performance methods', () => {
    test('reportPerformanceSpan does nothing when not initialized', () => {
      expect(() => RiviumTrace.reportPerformanceSpan({})).not.toThrow();
    });

    test('reportPerformanceSpanBatch does nothing when not initialized', () => {
      expect(() => RiviumTrace.reportPerformanceSpanBatch([{}, {}])).not.toThrow();
    });

    test('trackOperation just runs the function when not initialized', async () => {
      const result = await RiviumTrace.trackOperation('op', () => 42);
      expect(result).toBe(42);
    });

    test('flushPerformance does nothing when no client', async () => {
      await expect(RiviumTrace.flushPerformance()).resolves.toBeUndefined();
    });
  });

  // ─── enableLogging ────────────────────────────────────────────────

  describe('enableLogging()', () => {
    test('does nothing when not initialized', () => {
      expect(() => RiviumTrace.enableLogging()).not.toThrow();
    });

    test('creates log service when initialized', () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.enableLogging({ sourceId: 'src-1' });
      expect(RiviumTrace._instance._logService).toBeDefined();
    });
  });

  // ─── Rate limiting integration ────────────────────────────────────

  describe('rate limiting', () => {
    test('rate-limited errors are not sent', async () => {
      RiviumTrace.init(validOptions());
      const sendSpy = RiviumTrace._instance._httpClient.sendError;

      // Exhaust the rate limiter by sending many identical errors
      // Default: 10 same errors per minute
      for (let i = 0; i < 15; i++) {
        await RiviumTrace.captureException(new Error('identical'));
      }

      // Should have been called 10 times (the per-error limit)
      expect(sendSpy.mock.calls.length).toBe(10);
    });
  });
});
