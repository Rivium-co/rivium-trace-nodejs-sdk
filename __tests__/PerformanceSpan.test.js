const {
  PerformanceSpan,
  generateTraceId,
  generateSpanId,
} = require('../lib/performance/PerformanceSpan');

describe('generateTraceId', () => {
  test('returns a 32-character hex string', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTraceId()));
    expect(ids.size).toBe(50);
  });
});

describe('generateSpanId', () => {
  test('returns a 16-character hex string', () => {
    const id = generateSpanId();
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSpanId()));
    expect(ids.size).toBe(50);
  });
});

describe('PerformanceSpan', () => {
  // ─── Constructor Defaults ─────────────────────────────────────────

  describe('constructor defaults', () => {
    test('defaults operation to empty string', () => {
      const span = new PerformanceSpan();
      expect(span.operation).toBe('');
    });

    test('defaults operationType to "custom"', () => {
      const span = new PerformanceSpan();
      expect(span.operationType).toBe('custom');
    });

    test('auto-generates traceId', () => {
      const span = new PerformanceSpan();
      expect(span.traceId).toMatch(/^[a-f0-9]{32}$/);
    });

    test('auto-generates spanId', () => {
      const span = new PerformanceSpan();
      expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);
    });

    test('defaults parentSpanId to null', () => {
      const span = new PerformanceSpan();
      expect(span.parentSpanId).toBeNull();
    });

    test('defaults HTTP fields to null', () => {
      const span = new PerformanceSpan();
      expect(span.httpMethod).toBeNull();
      expect(span.httpUrl).toBeNull();
      expect(span.httpStatusCode).toBeNull();
      expect(span.httpHost).toBeNull();
    });

    test('defaults durationMs to 0', () => {
      const span = new PerformanceSpan();
      expect(span.durationMs).toBe(0);
    });

    test('sets platform to "nodejs"', () => {
      const span = new PerformanceSpan();
      expect(span.platform).toBe('nodejs');
    });

    test('defaults status to "ok"', () => {
      const span = new PerformanceSpan();
      expect(span.status).toBe('ok');
    });

    test('defaults errorMessage to null', () => {
      const span = new PerformanceSpan();
      expect(span.errorMessage).toBeNull();
    });

    test('defaults tags to empty object', () => {
      const span = new PerformanceSpan();
      expect(span.tags).toEqual({});
    });

    test('defaults metadata to empty object', () => {
      const span = new PerformanceSpan();
      expect(span.metadata).toEqual({});
    });
  });

  // ─── Constructor with Custom Options ──────────────────────────────

  describe('constructor with custom options', () => {
    test('accepts all custom options', () => {
      const span = new PerformanceSpan({
        operation: 'GET /api',
        operationType: 'http',
        traceId: 'abc123',
        spanId: 'def456',
        parentSpanId: 'parent1',
        httpMethod: 'GET',
        httpUrl: 'https://example.com/api',
        httpStatusCode: 200,
        httpHost: 'example.com',
        durationMs: 150,
        startTime: '2024-01-01T00:00:00.000Z',
        endTime: '2024-01-01T00:00:00.150Z',
        environment: 'production',
        releaseVersion: '1.0.0',
        status: 'error',
        errorMessage: 'timeout',
        tags: { region: 'us-east' },
        metadata: { retries: 2 },
      });

      expect(span.operation).toBe('GET /api');
      expect(span.operationType).toBe('http');
      expect(span.traceId).toBe('abc123');
      expect(span.spanId).toBe('def456');
      expect(span.parentSpanId).toBe('parent1');
      expect(span.httpMethod).toBe('GET');
      expect(span.httpUrl).toBe('https://example.com/api');
      expect(span.httpStatusCode).toBe(200);
      expect(span.httpHost).toBe('example.com');
      expect(span.durationMs).toBe(150);
      expect(span.environment).toBe('production');
      expect(span.releaseVersion).toBe('1.0.0');
      expect(span.status).toBe('error');
      expect(span.errorMessage).toBe('timeout');
      expect(span.tags).toEqual({ region: 'us-east' });
      expect(span.metadata).toEqual({ retries: 2 });
    });
  });

  // ─── toJSON ───────────────────────────────────────────────────────

  describe('toJSON()', () => {
    test('always includes required fields', () => {
      const span = new PerformanceSpan({ operation: 'op', durationMs: 100 });
      const json = span.toJSON();

      expect(json).toHaveProperty('operation', 'op');
      expect(json).toHaveProperty('operation_type', 'custom');
      expect(json).toHaveProperty('duration_ms', 100);
      expect(json).toHaveProperty('start_time');
      expect(json).toHaveProperty('platform', 'nodejs');
      expect(json).toHaveProperty('status', 'ok');
    });

    test('includes traceId and spanId when present', () => {
      const span = new PerformanceSpan();
      const json = span.toJSON();
      expect(json).toHaveProperty('trace_id');
      expect(json).toHaveProperty('span_id');
    });

    test('includes parentSpanId when set', () => {
      const span = new PerformanceSpan({ parentSpanId: 'parent' });
      const json = span.toJSON();
      expect(json.parent_span_id).toBe('parent');
    });

    test('omits parentSpanId when null', () => {
      const span = new PerformanceSpan();
      const json = span.toJSON();
      expect(json.parent_span_id).toBeUndefined();
    });

    test('includes HTTP fields only when set', () => {
      const withHttp = new PerformanceSpan({
        httpMethod: 'POST',
        httpUrl: '/api',
        httpStatusCode: 201,
        httpHost: 'localhost',
      });
      const json = withHttp.toJSON();
      expect(json.http_method).toBe('POST');
      expect(json.http_url).toBe('/api');
      expect(json.http_status_code).toBe(201);
      expect(json.http_host).toBe('localhost');
    });

    test('omits HTTP fields when null', () => {
      const span = new PerformanceSpan();
      const json = span.toJSON();
      expect(json.http_method).toBeUndefined();
      expect(json.http_url).toBeUndefined();
      expect(json.http_status_code).toBeUndefined();
      expect(json.http_host).toBeUndefined();
    });

    test('includes endTime when set', () => {
      const span = new PerformanceSpan({ endTime: '2024-01-01T00:00:01.000Z' });
      expect(span.toJSON().end_time).toBe('2024-01-01T00:00:01.000Z');
    });

    test('omits endTime when null', () => {
      const span = new PerformanceSpan();
      expect(span.toJSON().end_time).toBeUndefined();
    });

    test('includes environment when set', () => {
      const span = new PerformanceSpan({ environment: 'staging' });
      expect(span.toJSON().environment).toBe('staging');
    });

    test('includes errorMessage when set', () => {
      const span = new PerformanceSpan({ errorMessage: 'fail' });
      expect(span.toJSON().error_message).toBe('fail');
    });

    test('includes tags when non-empty', () => {
      const span = new PerformanceSpan({ tags: { a: '1' } });
      expect(span.toJSON().tags).toEqual({ a: '1' });
    });

    test('omits tags when empty', () => {
      const span = new PerformanceSpan();
      expect(span.toJSON().tags).toBeUndefined();
    });

    test('includes metadata when non-empty', () => {
      const span = new PerformanceSpan({ metadata: { b: 2 } });
      expect(span.toJSON().metadata).toEqual({ b: 2 });
    });

    test('omits metadata when empty', () => {
      const span = new PerformanceSpan();
      expect(span.toJSON().metadata).toBeUndefined();
    });

    test('httpStatusCode of 0 is treated as falsy and becomes null', () => {
      const span = new PerformanceSpan({ httpStatusCode: 0 });
      // 0 || null evaluates to null in the constructor
      expect(span.toJSON().http_status_code).toBeUndefined();
    });
  });

  // ─── fromHttpRequest ──────────────────────────────────────────────

  describe('fromHttpRequest()', () => {
    test('creates span from HTTP request with full URL', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://api.example.com/users',
        statusCode: 200,
        durationMs: 250,
        startTime: new Date('2024-01-01T00:00:00.000Z'),
      });

      expect(span.operation).toBe('GET /users');
      expect(span.operationType).toBe('http');
      expect(span.httpMethod).toBe('GET');
      expect(span.httpUrl).toBe('https://api.example.com/users');
      expect(span.httpStatusCode).toBe(200);
      expect(span.httpHost).toBe('api.example.com');
      expect(span.durationMs).toBe(250);
      expect(span.status).toBe('ok');
    });

    test('sets status to "error" for 4xx status codes', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://api.example.com/missing',
        statusCode: 404,
        durationMs: 50,
        startTime: new Date(),
      });
      expect(span.status).toBe('error');
    });

    test('sets status to "error" for 5xx status codes', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'POST',
        url: 'https://api.example.com/fail',
        statusCode: 500,
        durationMs: 100,
        startTime: new Date(),
      });
      expect(span.status).toBe('error');
    });

    test('sets status to "error" when errorMessage is provided', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: '/api/test',
        statusCode: 200,
        durationMs: 50,
        errorMessage: 'something went wrong',
        startTime: new Date(),
      });
      expect(span.status).toBe('error');
      expect(span.errorMessage).toBe('something went wrong');
    });

    test('handles non-URL strings (path only) gracefully', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: '/api/users',
        statusCode: 200,
        durationMs: 50,
        startTime: new Date(),
      });
      // When URL() throws, it falls back to substring
      expect(span.operation).toContain('GET');
    });

    test('calculates endTime from startTime + durationMs', () => {
      const start = new Date('2024-06-01T12:00:00.000Z');
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://example.com/',
        statusCode: 200,
        durationMs: 500,
        startTime: start,
      });
      const expected = new Date(start.getTime() + 500).toISOString();
      expect(span.endTime).toBe(expected);
    });

    test('accepts startTime as ISO string', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://example.com/',
        statusCode: 200,
        durationMs: 100,
        startTime: '2024-06-01T12:00:00.000Z',
      });
      expect(span.startTime).toBe('2024-06-01T12:00:00.000Z');
    });

    test('passes environment and releaseVersion', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://example.com/',
        statusCode: 200,
        durationMs: 10,
        environment: 'production',
        releaseVersion: '2.0.0',
        startTime: new Date(),
      });
      expect(span.environment).toBe('production');
      expect(span.releaseVersion).toBe('2.0.0');
    });

    test('passes custom tags', () => {
      const span = PerformanceSpan.fromHttpRequest({
        method: 'GET',
        url: 'https://example.com/',
        statusCode: 200,
        durationMs: 10,
        tags: { service: 'auth' },
        startTime: new Date(),
      });
      expect(span.tags).toEqual({ service: 'auth' });
    });
  });

  // ─── forDbQuery ───────────────────────────────────────────────────

  describe('forDbQuery()', () => {
    test('creates span with correct operation', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'SELECT',
        tableName: 'users',
        durationMs: 30,
        startTime: new Date('2024-01-01T00:00:00.000Z'),
      });
      expect(span.operation).toBe('SELECT users');
      expect(span.operationType).toBe('db');
    });

    test('sets tags for db_table and query_type', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'INSERT',
        tableName: 'orders',
        durationMs: 15,
        startTime: new Date(),
      });
      expect(span.tags.db_table).toBe('orders');
      expect(span.tags.query_type).toBe('INSERT');
    });

    test('includes rows_affected as string in tags when provided', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'UPDATE',
        tableName: 'products',
        durationMs: 20,
        rowsAffected: 5,
        startTime: new Date(),
      });
      expect(span.tags.rows_affected).toBe('5');
    });

    test('does not include rows_affected when undefined', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'SELECT',
        tableName: 'users',
        durationMs: 10,
        startTime: new Date(),
      });
      expect(span.tags.rows_affected).toBeUndefined();
    });

    test('sets status to "error" when errorMessage is provided', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'DELETE',
        tableName: 'temp',
        durationMs: 5,
        errorMessage: 'constraint violation',
        startTime: new Date(),
      });
      expect(span.status).toBe('error');
      expect(span.errorMessage).toBe('constraint violation');
    });

    test('sets status to "ok" when no error', () => {
      const span = PerformanceSpan.forDbQuery({
        queryType: 'SELECT',
        tableName: 'users',
        durationMs: 10,
        startTime: new Date(),
      });
      expect(span.status).toBe('ok');
    });

    test('calculates endTime from startTime + durationMs', () => {
      const start = new Date('2024-06-01T12:00:00.000Z');
      const span = PerformanceSpan.forDbQuery({
        queryType: 'SELECT',
        tableName: 'users',
        durationMs: 200,
        startTime: start,
      });
      expect(span.endTime).toBe(new Date(start.getTime() + 200).toISOString());
    });
  });

  // ─── custom ───────────────────────────────────────────────────────

  describe('custom()', () => {
    test('creates a custom span with given operation', () => {
      const span = PerformanceSpan.custom({
        operation: 'process-payment',
        durationMs: 1200,
        startTime: new Date('2024-01-01T00:00:00.000Z'),
      });
      expect(span.operation).toBe('process-payment');
      expect(span.operationType).toBe('custom');
      expect(span.durationMs).toBe(1200);
    });

    test('allows custom operationType', () => {
      const span = PerformanceSpan.custom({
        operation: 'cache-lookup',
        operationType: 'cache',
        durationMs: 5,
        startTime: new Date(),
      });
      expect(span.operationType).toBe('cache');
    });

    test('sets status from options', () => {
      const span = PerformanceSpan.custom({
        operation: 'task',
        durationMs: 100,
        status: 'timeout',
        startTime: new Date(),
      });
      expect(span.status).toBe('timeout');
    });

    test('infers error status from errorMessage when no explicit status', () => {
      const span = PerformanceSpan.custom({
        operation: 'task',
        durationMs: 100,
        errorMessage: 'oops',
        startTime: new Date(),
      });
      expect(span.status).toBe('error');
    });

    test('defaults status to "ok" when no error and no explicit status', () => {
      const span = PerformanceSpan.custom({
        operation: 'task',
        durationMs: 50,
        startTime: new Date(),
      });
      expect(span.status).toBe('ok');
    });

    test('calculates endTime', () => {
      const start = new Date('2024-06-01T00:00:00.000Z');
      const span = PerformanceSpan.custom({
        operation: 'op',
        durationMs: 300,
        startTime: start,
      });
      expect(span.endTime).toBe(new Date(start.getTime() + 300).toISOString());
    });

    test('passes tags through', () => {
      const span = PerformanceSpan.custom({
        operation: 'op',
        durationMs: 10,
        tags: { priority: 'high' },
        startTime: new Date(),
      });
      expect(span.tags).toEqual({ priority: 'high' });
    });
  });
});
