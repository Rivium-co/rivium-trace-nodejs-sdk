const RiviumTrace = require('../index');

// Sends that stay open until the test releases them.
const pending = [];
jest.mock('../lib/handlers/HttpClient', () => {
  return jest.fn().mockImplementation(() => ({
    sendError: jest.fn(() => new Promise((resolve) => pending.push(resolve))),
    sendMessage: jest.fn(() => new Promise((resolve) => pending.push(resolve))),
  }));
});

jest.mock('../lib/performance/PerformanceClient', () => ({
  PerformanceClient: jest.fn().mockImplementation(() => ({
    reportSpan: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  })),
}));

const release = () => pending.splice(0).forEach((resolve) => resolve({ success: true, statusCode: 200 }));

describe('RiviumTrace.flush', () => {
  beforeEach(() => {
    pending.length = 0;
    RiviumTrace.init({
      apiKey: 'rv_live_abc123',
      serverSecret: 'rv_srv_secret456',
      captureUncaughtExceptions: false,
      captureUnhandledRejections: false,
    });
  });

  afterEach(async () => {
    release();
    await RiviumTrace.close();
  });

  test('resolves true at once when nothing is waiting', async () => {
    await expect(RiviumTrace.flush(1000)).resolves.toBe(true);
  });

  test('waits for an error that is still being sent', async () => {
    RiviumTrace.captureException(new Error('boom'));
    let finished = false;
    const flushed = RiviumTrace.flush(2000).then((result) => {
      finished = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(finished).toBe(false);

    release();
    await expect(flushed).resolves.toBe(true);
  });

  test('waits for a message that is still being sent', async () => {
    RiviumTrace.captureMessage('hello');
    const flushed = RiviumTrace.flush(2000);
    release();
    await expect(flushed).resolves.toBe(true);
  });

  test('resolves false when the timeout passes first', async () => {
    RiviumTrace.captureException(new Error('slow'));
    await expect(RiviumTrace.flush(50)).resolves.toBe(false);
  });

  test('flushes the performance buffer', async () => {
    RiviumTrace.reportPerformanceSpan({ operation: 'x', durationMs: 1 });
    const client = RiviumTrace.instance._performanceClient;
    await RiviumTrace.flush(1000);
    expect(client.flush).toHaveBeenCalled();
  });

  test('does not reject when a send fails', async () => {
    RiviumTrace.instance._trackSend(Promise.reject(new Error('network')));
    await expect(RiviumTrace.flush(1000)).resolves.toBe(true);
  });
});
