const HttpClient = require('../lib/handlers/HttpClient');
const RiviumTraceError = require('../lib/models/RiviumTraceError');
const RiviumTraceConfig = require('../lib/config/RiviumTraceConfig');

// We store the last request for test assertions
let mockLastRequest = null;

// We mock http/https to avoid actual network calls
jest.mock('https', () => {
  const { EventEmitter } = require('events');

  return {
    request: jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn();
      req.destroy = jest.fn();
      // Store callback so tests can trigger response
      req._callback = callback;
      // Store reference for tests
      mockLastRequest = req;
      return req;
    }),
  };
});

function createConfig(overrides = {}) {
  return new RiviumTraceConfig({
    apiKey: 'rv_live_testkey',
    serverSecret: 'rv_srv_testsecret',
    enabled: true,
    debug: false,
    timeout: 5000,
    ...overrides,
  });
}

function createMockResponse(statusCode, data = '') { // eslint-disable-line no-unused-vars
  const { EventEmitter } = require('events');
  const res = new EventEmitter();
  res.statusCode = statusCode;
  return { res, data };
}

function simulateSuccessResponse(req, statusCode = 200, data = '{"ok":true}') {
  const { EventEmitter } = require('events');
  const res = new EventEmitter();
  res.statusCode = statusCode;
  req._callback(res);
  res.emit('data', data);
  res.emit('end');
}

describe('HttpClient', () => {
  let https;

  beforeEach(() => {
    jest.clearAllMocks();
    https = require('https');
  });

  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    test('stores config reference', () => {
      const config = createConfig();
      const client = new HttpClient(config);
      expect(client.config).toBe(config);
    });

    test('sets retryAttempts to 3', () => {
      const client = new HttpClient(createConfig());
      expect(client.retryAttempts).toBe(3);
    });

    test('sets retryDelay to 1000', () => {
      const client = new HttpClient(createConfig());
      expect(client.retryDelay).toBe(1000);
    });
  });

  // ─── sendError ────────────────────────────────────────────────────

  describe('sendError()', () => {
    test('returns disabled result when config is disabled', async () => {
      const config = createConfig({ enabled: false });
      const client = new HttpClient(config);
      const error = new RiviumTraceError({ message: 'test' });

      const result = await client.sendError(error);

      expect(result).toEqual({ success: false, reason: 'disabled' });
    });

    test('calls _sendWithRetry with serialized payload', async () => {
      const config = createConfig();
      const client = new HttpClient(config);
      const error = new RiviumTraceError({ message: 'test' });

      const spy = jest.spyOn(client, '_sendWithRetry').mockResolvedValue({ success: true });
      await client.sendError(error);

      expect(spy).toHaveBeenCalledWith(
        'https://trace.rivium.co/api/errors',
        expect.any(String)
      );

      const payload = JSON.parse(spy.mock.calls[0][1]);
      expect(payload.message).toBe('test');
      spy.mockRestore();
    });
  });

  // ─── _shouldRetry ────────────────────────────────────────────────

  describe('_shouldRetry()', () => {
    let client;
    beforeEach(() => {
      client = new HttpClient(createConfig());
    });

    test('returns true for timeout errors', () => {
      expect(client._shouldRetry(new Error('Request timeout'))).toBe(true);
    });

    test('returns true for ECONNREFUSED', () => {
      expect(client._shouldRetry(new Error('ECONNREFUSED'))).toBe(true);
    });

    test('returns true for ENOTFOUND', () => {
      expect(client._shouldRetry(new Error('ENOTFOUND'))).toBe(true);
    });

    test('returns true for HTTP 5xx errors', () => {
      expect(client._shouldRetry(new Error('HTTP 500: Internal Server Error'))).toBe(true);
      expect(client._shouldRetry(new Error('HTTP 503: Service Unavailable'))).toBe(true);
    });

    test('returns false for HTTP 4xx errors', () => {
      expect(client._shouldRetry(new Error('HTTP 400: Bad Request'))).toBe(false);
      expect(client._shouldRetry(new Error('HTTP 404: Not Found'))).toBe(false);
    });

    test('returns false for generic errors', () => {
      expect(client._shouldRetry(new Error('Something else'))).toBe(false);
    });
  });

  // ─── _delay ──────────────────────────────────────────────────────

  describe('_delay()', () => {
    test('resolves after specified ms', async () => {
      jest.useFakeTimers();
      const client = new HttpClient(createConfig());

      let resolved = false;
      const promise = client._delay(1000).then(() => { resolved = true; });

      expect(resolved).toBe(false);
      jest.advanceTimersByTime(1000);
      await promise;
      expect(resolved).toBe(true);

      jest.useRealTimers();
    });
  });

  // ─── _getUserAgent ────────────────────────────────────────────────

  describe('_getUserAgent()', () => {
    test('returns string containing RiviumTrace-SDK', () => {
      const client = new HttpClient(createConfig());
      const ua = client._getUserAgent();
      expect(ua).toContain('RiviumTrace-SDK/');
    });

    test('includes nodejs platform', () => {
      const client = new HttpClient(createConfig());
      const ua = client._getUserAgent();
      expect(ua).toContain('nodejs');
    });

    test('includes Node.js version', () => {
      const client = new HttpClient(createConfig());
      const ua = client._getUserAgent();
      expect(ua).toContain(process.version);
    });
  });

  // ─── _makeRequest ────────────────────────────────────────────────

  describe('_makeRequest()', () => {
    test('sends POST request with correct headers', () => {
      const config = createConfig();
      const client = new HttpClient(config);

      // Start the request (don't await, as it's waiting for response)
      client._makeRequest('https://trace.rivium.co/api/errors', '{"test":true}');

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'trace.rivium.co',
          path: '/api/errors',
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'rv_live_testkey',
            'x-server-secret': 'rv_srv_testsecret',
          }),
        }),
        expect.any(Function)
      );
    });

    test('resolves with statusCode and data on 2xx response', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      simulateSuccessResponse(req, 200, '{"id":"123"}');

      const result = await promise;
      expect(result.statusCode).toBe(200);
      expect(result.data).toBe('{"id":"123"}');
    });

    test('resolves for 409 (duplicate) status', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      simulateSuccessResponse(req, 409, 'duplicate');

      const result = await promise;
      expect(result.statusCode).toBe(409);
    });

    test('rejects on 4xx non-409 status', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      simulateSuccessResponse(req, 400, 'bad request');

      await expect(promise).rejects.toThrow('HTTP 400');
    });

    test('rejects on 5xx status', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      simulateSuccessResponse(req, 500, 'server error');

      await expect(promise).rejects.toThrow('HTTP 500');
    });

    test('rejects on request error', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      req.emit('error', new Error('ECONNREFUSED'));

      await expect(promise).rejects.toThrow('ECONNREFUSED');
    });

    test('rejects on timeout', async () => {
      const config = createConfig();
      const client = new HttpClient(config);

      const promise = client._makeRequest('https://trace.rivium.co/api/errors', '{}');
      const req = mockLastRequest;
      req.emit('timeout');

      await expect(promise).rejects.toThrow('Request timeout');
      expect(req.destroy).toHaveBeenCalled();
    });

    test('writes payload and ends request', () => {
      const config = createConfig();
      const client = new HttpClient(config);

      client._makeRequest('https://trace.rivium.co/api/errors', '{"data":"test"}');
      const req = mockLastRequest;

      expect(req.write).toHaveBeenCalledWith('{"data":"test"}');
      expect(req.end).toHaveBeenCalled();
    });
  });
});
