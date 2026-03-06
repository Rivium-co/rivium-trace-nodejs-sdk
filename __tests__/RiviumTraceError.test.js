const RiviumTraceError = require('../lib/models/RiviumTraceError');
const { SDK_VERSION } = require('../lib/config/RiviumTraceConfig');
const os = require('os');

describe('RiviumTraceError', () => {
  // ─── Constructor Defaults ─────────────────────────────────────────

  describe('constructor defaults', () => {
    test('sets default message to "Unknown error"', () => {
      const err = new RiviumTraceError();
      expect(err.message).toBe('Unknown error');
    });

    test('sets default stack_trace to empty string', () => {
      const err = new RiviumTraceError();
      expect(err.stack_trace).toBe('');
    });

    test('sets platform to "nodejs"', () => {
      const err = new RiviumTraceError();
      expect(err.platform).toBe('nodejs');
    });

    test('sets default environment to "development"', () => {
      const err = new RiviumTraceError();
      expect(err.environment).toBe('development');
    });

    test('sets default release to SDK_VERSION', () => {
      const err = new RiviumTraceError();
      expect(err.release).toBe(SDK_VERSION);
    });

    test('sets timestamp to a valid ISO string', () => {
      const before = new Date().toISOString();
      const err = new RiviumTraceError();
      const after = new Date().toISOString();
      expect(err.timestamp >= before).toBe(true);
      expect(err.timestamp <= after).toBe(true);
    });

    test('sets default extra to empty object', () => {
      const err = new RiviumTraceError();
      expect(err.extra).toEqual({});
    });

    test('sets default url to empty string', () => {
      const err = new RiviumTraceError();
      expect(err.url).toBe('');
    });

    test('generates user_agent automatically', () => {
      const err = new RiviumTraceError();
      expect(err.user_agent).toContain('RiviumTrace-SDK/');
      expect(err.user_agent).toContain('nodejs');
      expect(err.user_agent).toContain(os.platform());
    });
  });

  // ─── Constructor with Options ─────────────────────────────────────

  describe('constructor with custom options', () => {
    test('accepts custom message', () => {
      const err = new RiviumTraceError({ message: 'Custom error' });
      expect(err.message).toBe('Custom error');
    });

    test('accepts custom stack_trace', () => {
      const err = new RiviumTraceError({ stack_trace: 'at line 42' });
      expect(err.stack_trace).toBe('at line 42');
    });

    test('accepts custom environment', () => {
      const err = new RiviumTraceError({ environment: 'production' });
      expect(err.environment).toBe('production');
    });

    test('accepts custom release', () => {
      const err = new RiviumTraceError({ release: '3.0.0' });
      expect(err.release).toBe('3.0.0');
    });

    test('accepts custom timestamp', () => {
      const ts = '2024-01-01T00:00:00.000Z';
      const err = new RiviumTraceError({ timestamp: ts });
      expect(err.timestamp).toBe(ts);
    });

    test('accepts custom extra', () => {
      const extra = { userId: 42 };
      const err = new RiviumTraceError({ extra });
      expect(err.extra).toEqual({ userId: 42 });
    });

    test('accepts custom user_agent', () => {
      const err = new RiviumTraceError({ user_agent: 'CustomAgent/1.0' });
      expect(err.user_agent).toBe('CustomAgent/1.0');
    });

    test('accepts custom url', () => {
      const err = new RiviumTraceError({ url: '/api/test' });
      expect(err.url).toBe('/api/test');
    });
  });

  // ─── toJSON ───────────────────────────────────────────────────────

  describe('toJSON()', () => {
    test('returns correct shape with required fields', () => {
      const err = new RiviumTraceError({ message: 'test', environment: 'prod' });
      const json = err.toJSON();

      expect(json).toHaveProperty('message', 'test');
      expect(json).toHaveProperty('stack_trace');
      expect(json).toHaveProperty('platform', 'nodejs');
      expect(json).toHaveProperty('environment', 'prod');
      expect(json).toHaveProperty('release_version');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('user_agent');
      expect(json).toHaveProperty('url');
    });

    test('uses release_version key (not release)', () => {
      const err = new RiviumTraceError({ release: '2.0.0' });
      const json = err.toJSON();
      expect(json.release_version).toBe('2.0.0');
      expect(json.release).toBeUndefined();
    });

    test('extracts breadcrumbs from extra to root level', () => {
      const breadcrumbs = [{ message: 'click' }];
      const err = new RiviumTraceError({ extra: { breadcrumbs, foo: 'bar' } });
      const json = err.toJSON();

      expect(json.breadcrumbs).toEqual(breadcrumbs);
      expect(json.extra).toEqual({ foo: 'bar' });
      expect(json.extra.breadcrumbs).toBeUndefined();
    });

    test('does not include extra key when extra is empty after breadcrumb extraction', () => {
      const err = new RiviumTraceError({ extra: { breadcrumbs: [] } });
      const json = err.toJSON();
      expect(json.breadcrumbs).toEqual([]);
      expect(json.extra).toBeUndefined();
    });

    test('does not include breadcrumbs key when none provided', () => {
      const err = new RiviumTraceError({ extra: {} });
      const json = err.toJSON();
      expect(json.breadcrumbs).toBeUndefined();
    });

    test('includes extra when it has non-breadcrumb data', () => {
      const err = new RiviumTraceError({ extra: { customField: 'value' } });
      const json = err.toJSON();
      expect(json.extra).toEqual({ customField: 'value' });
    });

    test('does not mutate the original extra object', () => {
      const extra = { breadcrumbs: [{ msg: 'x' }], other: 1 };
      const err = new RiviumTraceError({ extra });
      err.toJSON();
      // Original extra on the error should still have breadcrumbs
      expect(err.extra.breadcrumbs).toEqual([{ msg: 'x' }]);
    });
  });

  // ─── fromError ────────────────────────────────────────────────────

  describe('fromError()', () => {
    test('creates RiviumTraceError from native Error', () => {
      const native = new Error('native error');
      const err = RiviumTraceError.fromError(native);

      expect(err).toBeInstanceOf(RiviumTraceError);
      expect(err.message).toBe('native error');
      expect(err.stack_trace).toContain('native error');
    });

    test('uses String(error) when error.message is falsy', () => {
      const obj = { toString: () => 'string fallback' };
      const err = RiviumTraceError.fromError(obj);
      expect(err.message).toBe('string fallback');
    });

    test('passes environment and release options through', () => {
      const err = RiviumTraceError.fromError(new Error('x'), {
        environment: 'staging',
        release: '4.0.0',
      });
      expect(err.environment).toBe('staging');
      expect(err.release).toBe('4.0.0');
    });

    test('passes extra options through', () => {
      const err = RiviumTraceError.fromError(new Error('x'), {
        extra: { key: 'val' },
      });
      expect(err.extra).toEqual({ key: 'val' });
    });

    test('passes url option through', () => {
      const err = RiviumTraceError.fromError(new Error('x'), {
        url: '/api/foo',
      });
      expect(err.url).toBe('/api/foo');
    });

    test('sets a valid timestamp', () => {
      const before = Date.now();
      const err = RiviumTraceError.fromError(new Error('x'));
      const after = Date.now();
      const ts = new Date(err.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    test('generates stack from new Error() when error.stack is falsy', () => {
      const err = RiviumTraceError.fromError({ message: 'no stack' });
      expect(err.stack_trace).toBeTruthy();
    });
  });

  // ─── fromMessage ──────────────────────────────────────────────────

  describe('fromMessage()', () => {
    test('creates RiviumTraceError from a string message', () => {
      const err = RiviumTraceError.fromMessage('something happened');
      expect(err).toBeInstanceOf(RiviumTraceError);
      expect(err.message).toBe('something happened');
    });

    test('generates a stack trace', () => {
      const err = RiviumTraceError.fromMessage('msg');
      expect(err.stack_trace).toBeTruthy();
    });

    test('passes options through', () => {
      const err = RiviumTraceError.fromMessage('msg', {
        environment: 'production',
        release: '1.2.3',
        extra: { info: true },
        url: '/health',
      });
      expect(err.environment).toBe('production');
      expect(err.release).toBe('1.2.3');
      expect(err.extra).toEqual({ info: true });
      expect(err.url).toBe('/health');
    });
  });

  // ─── setExtra / setExtras ─────────────────────────────────────────

  describe('setExtra()', () => {
    test('adds a key-value pair to extra', () => {
      const err = new RiviumTraceError();
      err.setExtra('userId', 123);
      expect(err.extra.userId).toBe(123);
    });

    test('returns the error instance for chaining', () => {
      const err = new RiviumTraceError();
      const result = err.setExtra('a', 1);
      expect(result).toBe(err);
    });

    test('overwrites existing key', () => {
      const err = new RiviumTraceError({ extra: { x: 'old' } });
      err.setExtra('x', 'new');
      expect(err.extra.x).toBe('new');
    });
  });

  describe('setExtras()', () => {
    test('merges multiple keys into extra', () => {
      const err = new RiviumTraceError();
      err.setExtras({ a: 1, b: 2 });
      expect(err.extra).toEqual({ a: 1, b: 2 });
    });

    test('returns the error instance for chaining', () => {
      const err = new RiviumTraceError();
      const result = err.setExtras({ a: 1 });
      expect(result).toBe(err);
    });

    test('preserves existing extra fields', () => {
      const err = new RiviumTraceError({ extra: { existing: true } });
      err.setExtras({ added: true });
      expect(err.extra).toEqual({ existing: true, added: true });
    });
  });

  // ─── setRequestContext ────────────────────────────────────────────

  describe('setRequestContext()', () => {
    test('populates extra.request from Express-like req', () => {
      const err = new RiviumTraceError();
      const req = {
        method: 'POST',
        url: '/api/users',
        headers: { 'content-type': 'application/json' },
        ip: '127.0.0.1',
        query: { page: '1' },
        params: { id: '42' },
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
      };
      err.setRequestContext(req);

      expect(err.extra.request.method).toBe('POST');
      expect(err.extra.request.url).toBe('/api/users');
      expect(err.extra.request.ip).toBe('127.0.0.1');
      expect(err.url).toBe('/api/users');
      expect(err.user_agent).toBe('Mozilla/5.0');
    });

    test('returns the error instance for chaining', () => {
      const err = new RiviumTraceError();
      const result = err.setRequestContext({ method: 'GET', url: '/', headers: {} });
      expect(result).toBe(err);
    });

    test('handles null req gracefully', () => {
      const err = new RiviumTraceError();
      const result = err.setRequestContext(null);
      expect(result).toBe(err);
      expect(err.extra.request).toBeUndefined();
    });

    test('falls back to headers user-agent when req.get is not available', () => {
      const err = new RiviumTraceError();
      const req = {
        method: 'GET',
        url: '/',
        headers: { 'user-agent': 'FallbackAgent' },
      };
      err.setRequestContext(req);
      expect(err.user_agent).toBe('FallbackAgent');
    });

    test('falls back to connection.remoteAddress when req.ip is missing', () => {
      const err = new RiviumTraceError();
      const req = {
        method: 'GET',
        url: '/',
        headers: {},
        connection: { remoteAddress: '10.0.0.1' },
      };
      err.setRequestContext(req);
      expect(err.extra.request.ip).toBe('10.0.0.1');
    });
  });

  // ─── addNodeContext ───────────────────────────────────────────────

  describe('addNodeContext()', () => {
    test('adds node_context to extra', () => {
      const err = new RiviumTraceError();
      err.addNodeContext();
      const ctx = err.extra.node_context;

      expect(ctx).toBeDefined();
      expect(ctx.node_version).toBe(process.version);
      expect(ctx.platform).toBe(os.platform());
      expect(ctx.arch).toBe(os.arch());
      expect(ctx.memory_usage).toBeDefined();
      expect(typeof ctx.uptime).toBe('number');
      expect(ctx.pid).toBe(process.pid);
    });

    test('returns the error instance for chaining', () => {
      const err = new RiviumTraceError();
      const result = err.addNodeContext();
      expect(result).toBe(err);
    });

    test('memory_usage contains rss', () => {
      const err = new RiviumTraceError();
      err.addNodeContext();
      expect(err.extra.node_context.memory_usage).toHaveProperty('rss');
    });
  });

  // ─── _generateUserAgent ───────────────────────────────────────────

  describe('user agent generation', () => {
    test('contains SDK version', () => {
      const err = new RiviumTraceError();
      expect(err.user_agent).toContain(SDK_VERSION);
    });

    test('contains Node.js version', () => {
      const err = new RiviumTraceError();
      expect(err.user_agent).toContain(process.version);
    });
  });
});
