const RiviumTrace = require('../index');
const { createExpressMiddleware } = require('../lib/middleware/ExpressMiddleware');

// Mock network so we don't actually send anything.
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

const validOptions = () => ({
  apiKey: 'rv_live_abc123',
  serverSecret: 'rv_srv_secret456',
  captureUncaughtExceptions: false,
  captureUnhandledRejections: false,
});

const fakeReq = (overrides = {}) => ({
  method: 'GET',
  url: '/x',
  originalUrl: '/x',
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
  body: {},
  query: {},
  params: {},
  get: function (h) { return this.headers[String(h).toLowerCase()]; },
  ...overrides,
});

const fakeRes = () => {
  const res = {
    statusCode: 200,
    send: jest.fn(function (data) { return data; }),
  };
  return res;
};

describe('ExpressMiddleware (regression: instance-vs-static API)', () => {
  afterEach(async () => {
    await RiviumTrace.close();
  });

  // Regression for the bug where the middleware called
  // `this.riviumTrace.captureException(...)` etc. — but those methods are
  // STATIC on RiviumTrace, so the call threw `xxx is not a function` and the
  // host application bubbled a 500 for every request.

  test('requestHandler runs without throwing and calls into the static API', () => {
    RiviumTrace.init(validOptions());
    const setRequestSpy = jest.spyOn(RiviumTrace, 'setRequestContext');
    const breadcrumbSpy = jest.spyOn(RiviumTrace, 'addBreadcrumb');

    const handler = createExpressMiddleware(RiviumTrace).requestHandler();
    const req = fakeReq();
    const res = fakeRes();
    const next = jest.fn();

    expect(() => handler(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
    expect(setRequestSpy).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      originalUrl: '/x',
    }));
    expect(breadcrumbSpy).toHaveBeenCalled();

    // res.send wrapper should also fire a breadcrumb (the response one).
    breadcrumbSpy.mockClear();
    res.send('ok');
    expect(breadcrumbSpy).toHaveBeenCalled();

    setRequestSpy.mockRestore();
    breadcrumbSpy.mockRestore();
  });

  test('errorHandler runs without throwing and reports via captureException', async () => {
    RiviumTrace.init(validOptions());
    const captureSpy = jest.spyOn(RiviumTrace, 'captureException').mockResolvedValue();

    const handler = createExpressMiddleware(RiviumTrace).errorHandler();
    const err = new Error('boom');
    const req = fakeReq({ originalUrl: '/fail' });
    const res = fakeRes();
    res.statusCode = 500;
    const next = jest.fn();

    expect(() => handler(err, req, res, next)).not.toThrow();
    expect(captureSpy).toHaveBeenCalledWith(err, expect.objectContaining({
      extra: expect.objectContaining({
        request: expect.objectContaining({ url: '/fail', method: 'GET' }),
        response: expect.objectContaining({ statusCode: 500 }),
      }),
    }));
    // Must still forward the error so the next handler can format the response.
    expect(next).toHaveBeenCalledWith(err);

    captureSpy.mockRestore();
  });

  test('userMiddleware sets the user when present and no-ops otherwise', () => {
    RiviumTrace.init(validOptions());
    const setUserSpy = jest.spyOn(RiviumTrace, 'setUser');

    const handler = createExpressMiddleware(RiviumTrace).userMiddleware();

    const next1 = jest.fn();
    handler(fakeReq({ user: { id: 1, email: 'a@b.c', name: 'al' } }), fakeRes(), next1);
    expect(setUserSpy).toHaveBeenCalledWith({ id: 1, email: 'a@b.c', username: 'al' });
    expect(next1).toHaveBeenCalled();

    setUserSpy.mockClear();
    const next2 = jest.fn();
    handler(fakeReq(), fakeRes(), next2);
    expect(setUserSpy).not.toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();

    setUserSpy.mockRestore();
  });

  test('transactionMiddleware fires start + completion breadcrumbs', () => {
    RiviumTrace.init(validOptions());
    const breadcrumbSpy = jest.spyOn(RiviumTrace, 'addBreadcrumb');

    const handler = createExpressMiddleware(RiviumTrace).transactionMiddleware('checkout');
    const req = fakeReq();
    const res = fakeRes();
    const next = jest.fn();

    expect(() => handler(req, res, next)).not.toThrow();
    expect(breadcrumbSpy).toHaveBeenCalled();
    breadcrumbSpy.mockClear();

    res.send('done');
    expect(breadcrumbSpy).toHaveBeenCalled();

    breadcrumbSpy.mockRestore();
  });

  test('middleware does not crash when telemetry calls throw', () => {
    RiviumTrace.init(validOptions());
    jest.spyOn(RiviumTrace, 'setRequestContext').mockImplementation(() => {
      throw new Error('internal telemetry failure');
    });

    const handler = createExpressMiddleware(RiviumTrace).requestHandler();
    const next = jest.fn();
    expect(() => handler(fakeReq(), fakeRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);

    RiviumTrace.setRequestContext.mockRestore();
  });
});
