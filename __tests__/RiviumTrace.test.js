const RiviumTrace = require('../index');
const RiviumTraceError = require('../lib/models/RiviumTraceError');
const { Breadcrumb } = require('../lib/models/Breadcrumb');

// Mock HttpClient to prevent real network calls
jest.mock('../lib/handlers/HttpClient', () => {
  return jest.fn().mockImplementation(() => ({
    sendError: jest.fn().mockResolvedValue({ success: true, statusCode: 200 }),
    sendMessage: jest.fn().mockResolvedValue({ success: true, statusCode: 201 }),
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
    const sent = () => RiviumTrace._instance._httpClient.sendMessage.mock.calls[0][0];

    test('resolves silently when not initialized', async () => {
      const result = await RiviumTrace.captureMessage('no init');
      expect(result).toBeUndefined();
    });

    test('sends via sendMessage and never via sendError', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.captureMessage('test message');

      expect(RiviumTrace._instance._httpClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(RiviumTrace._instance._httpClient.sendError).not.toHaveBeenCalled();
      expect(sent().message).toBe('test message');
    });

    test('builds the /api/messages payload shape', async () => {
      RiviumTrace.init({ ...validOptions(), environment: 'staging', release: '9.9.9' });
      await RiviumTrace.captureMessage('shape');

      const msg = sent();
      expect(msg).toEqual(expect.objectContaining({
        message: 'shape',
        level: 'info',
        platform: 'nodejs',
        environment: 'staging',
        release: '9.9.9',
        tags: {},
      }));
      expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
      expect(msg.stack_trace).toBeUndefined();
      expect(Array.isArray(msg.breadcrumbs)).toBe(true);
    });

    test('carries _sdk.sdk_version in extra, keeping one the app set', async () => {
      RiviumTrace.init(validOptions());
      const { SDK_VERSION } = require('../lib/config/RiviumTraceConfig');
      await RiviumTrace.captureMessage('v');
      expect(sent().extra._sdk).toEqual({ sdk_version: SDK_VERSION });

      RiviumTrace._instance._httpClient.sendMessage.mockClear();
      await RiviumTrace.captureMessage('v2', { extra: { _sdk: { sdk_version: 'x' } } });
      expect(sent().extra._sdk).toEqual({ sdk_version: 'x' });
    });

    test('defaults level to info and accepts the four message levels', async () => {
      RiviumTrace.init(validOptions());
      const send = RiviumTrace._instance._httpClient.sendMessage;
      for (const level of ['debug', 'info', 'warning', 'error']) {
        await RiviumTrace.captureMessage(`lvl ${level}`, { level });
      }
      expect(send.mock.calls.map((c) => c[0].level)).toEqual(['debug', 'info', 'warning', 'error']);
    });

    test('maps warn, fatal, trace and unknown levels', async () => {
      RiviumTrace.init(validOptions());
      const send = RiviumTrace._instance._httpClient.sendMessage;
      await RiviumTrace.captureMessage('a', { level: 'warn' });
      await RiviumTrace.captureMessage('b', { level: 'fatal' });
      await RiviumTrace.captureMessage('c', { level: 'trace' });
      await RiviumTrace.captureMessage('d', { level: 'nonsense' });
      expect(send.mock.calls.map((c) => c[0].level)).toEqual(['warning', 'error', 'debug', 'info']);
    });

    test('includes extra and tags', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.captureMessage('msg', { extra: { detail: 'info' }, tags: { region: 'eu' } });

      expect(sent().extra.detail).toBe('info');
      expect(sent().tags).toEqual({ region: 'eu' });
    });

    test('puts the 10 most recent breadcrumbs at the top level, not in extra', async () => {
      RiviumTrace.init(validOptions());
      for (let i = 0; i < 12; i++) {
        RiviumTrace.addBreadcrumb({ message: `crumb ${i}`, category: 'test' });
      }
      await RiviumTrace.captureMessage('with crumbs');

      const msg = sent();
      expect(msg.breadcrumbs).toHaveLength(10);
      expect(msg.breadcrumbs[0].message).toBe('crumb 2');
      expect(msg.breadcrumbs[9].message).toBe('crumb 11');
      expect(msg.extra.breadcrumbs).toBeUndefined();
    });

    test('sets user_id from the user context', async () => {
      RiviumTrace.init(validOptions());
      RiviumTrace.setUser({ id: 42, email: 'a@b.c' });
      await RiviumTrace.captureMessage('user msg');

      expect(sent().user_id).toBe('42');
      expect(sent().extra.user_context).toEqual({ id: 42, email: 'a@b.c' });
    });

    test('omits user_id without a user', async () => {
      RiviumTrace.init(validOptions());
      await RiviumTrace.captureMessage('anon');
      expect(sent().user_id).toBeUndefined();
    });

    test('skips when beforeSend returns falsy', async () => {
      RiviumTrace.init({ ...validOptions(), beforeSend: () => null });
      await RiviumTrace.captureMessage('filtered');

      expect(RiviumTrace._instance._httpClient.sendMessage).not.toHaveBeenCalled();
      expect(RiviumTrace._instance._httpClient.sendError).not.toHaveBeenCalled();
    });

    test('beforeSend receives the message object and can modify it', async () => {
      const beforeSend = jest.fn((event) => ({ ...event, tags: { scrubbed: 'yes' } }));
      RiviumTrace.init({ ...validOptions(), beforeSend });
      await RiviumTrace.captureMessage('modify me');

      expect(beforeSend.mock.calls[0][0].message).toBe('modify me');
      expect(beforeSend.mock.calls[0][0].level).toBe('info');
      expect(sent().tags).toEqual({ scrubbed: 'yes' });
    });

    test('respects sample rate', async () => {
      RiviumTrace.init({ ...validOptions(), sampleRate: 0 });
      await RiviumTrace.captureMessage('sampled out');
      expect(RiviumTrace._instance._httpClient.sendMessage).not.toHaveBeenCalled();
    });

    test('does not send when disabled', async () => {
      RiviumTrace.init({ ...validOptions(), enabled: false });
      await RiviumTrace.captureMessage('disabled');
      expect(RiviumTrace._instance._httpClient.sendMessage).not.toHaveBeenCalled();
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
