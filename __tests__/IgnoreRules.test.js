const RiviumTrace = require('../index');
const RiviumTraceConfig = require('../lib/config/RiviumTraceConfig');
const { createExpressMiddleware } = require('../lib/middleware/ExpressMiddleware');

// Mock network so nothing is actually sent.
jest.mock('../lib/handlers/HttpClient', () => {
  return jest.fn().mockImplementation(() => ({
    sendError: jest.fn().mockResolvedValue({ success: true, statusCode: 200 }),
  }));
});

jest.mock('../lib/performance/PerformanceClient', () => ({
  PerformanceClient: jest.fn().mockImplementation(() => ({
    reportSpan: jest.fn(),
    trackOperation: jest.fn(async (op, fn) => fn()),
    flush: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  })),
}));

const config = (options = {}) =>
  new RiviumTraceConfig({ apiKey: 'rv_live_abc123', serverSecret: 'rv_srv_secret456', ...options });

/**
 * The Laravel SDK has always let an app say which exceptions and which request
 * paths are never worth reporting — a validation failure, a health check.
 * These are the Node equivalents.
 */
describe('ignoredExceptions', () => {
  const named = (name) => Object.assign(new Error('boom'), { name });

  it('reports everything when nothing is configured', () => {
    expect(config().shouldCaptureException(named('ValidationError'))).toBe(true);
  });

  it('matches on the error name', () => {
    const c = config({ ignoredExceptions: ['ValidationError'] });
    expect(c.shouldCaptureException(named('ValidationError'))).toBe(false);
    expect(c.shouldCaptureException(named('TypeError'))).toBe(true);
  });

  it('matches on a constructor', () => {
    class NotFoundError extends Error {}
    const c = config({ ignoredExceptions: [NotFoundError] });
    expect(c.shouldCaptureException(new NotFoundError('nope'))).toBe(false);
    expect(c.shouldCaptureException(new Error('other'))).toBe(true);
  });

  it('matches on a regular expression', () => {
    const c = config({ ignoredExceptions: [/Timeout$/] });
    expect(c.shouldCaptureException(named('ConnectionTimeout'))).toBe(false);
    expect(c.shouldCaptureException(named('ConnectionRefused'))).toBe(true);
  });
});

describe('ignoredPaths', () => {
  const c = config({ ignoredPaths: ['/health*', '/metrics', /^\/internal\//] });

  it('ignores nothing when the list is empty', () => {
    expect(config().shouldIgnorePath('/health')).toBe(false);
  });

  it('matches globs, exact paths and regular expressions', () => {
    expect(c.shouldIgnorePath('/health')).toBe(true);
    expect(c.shouldIgnorePath('/health/live')).toBe(true);
    expect(c.shouldIgnorePath('/metrics')).toBe(true);
    expect(c.shouldIgnorePath('/internal/debug')).toBe(true);
    expect(c.shouldIgnorePath('/api/users')).toBe(false);
    // A glob is anchored: it must not match a path that merely contains it.
    expect(c.shouldIgnorePath('/api/metrics')).toBe(false);
  });
});

describe('the middleware honours ignoredPaths', () => {
  beforeEach(() => {
    RiviumTrace.init({
      apiKey: 'rv_live_abc123',
      serverSecret: 'rv_srv_secret456',
      captureUncaughtExceptions: false,
      captureUnhandledRejections: false,
      ignoredPaths: ['/health*'],
    });
  });

  const req = (path) => ({
    method: 'GET',
    path,
    url: path,
    originalUrl: path,
    headers: {},
    get: () => '',
  });
  const res = () => ({ on: jest.fn(), send: jest.fn(), statusCode: 200 });

  it('passes an ignored request straight through', () => {
    const next = jest.fn();
    createExpressMiddleware(RiviumTrace).requestHandler()(req('/health/live'), res(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still tracks a normal request', () => {
    const next = jest.fn();
    const request = req('/api/users');
    createExpressMiddleware(RiviumTrace).requestHandler()(request, res(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(RiviumTrace.getStats().breadcrumbCount).toBeGreaterThan(0);
  });

  it('does not report an error raised on an ignored path', () => {
    const next = jest.fn();
    const spy = jest.spyOn(RiviumTrace, 'captureException');
    createExpressMiddleware(RiviumTrace).errorHandler()(new Error('boom'), req('/health'), res(), next);
    expect(spy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    spy.mockRestore();
  });
});
