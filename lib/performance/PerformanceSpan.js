// lib/performance/PerformanceSpan.js
const crypto = require('crypto');

function generateTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

class PerformanceSpan {
  constructor(options = {}) {
    this.operation = options.operation || '';
    this.operationType = options.operationType || 'custom';
    this.traceId = options.traceId || generateTraceId();
    this.spanId = options.spanId || generateSpanId();
    this.parentSpanId = options.parentSpanId || null;
    this.httpMethod = options.httpMethod || null;
    this.httpUrl = options.httpUrl || null;
    this.httpStatusCode = options.httpStatusCode || null;
    this.httpHost = options.httpHost || null;
    this.durationMs = options.durationMs || 0;
    this.startTime = options.startTime || new Date().toISOString();
    this.endTime = options.endTime || null;
    this.platform = 'nodejs';
    this.environment = options.environment || null;
    this.releaseVersion = options.releaseVersion || null;
    this.status = options.status || 'ok';
    this.errorMessage = options.errorMessage || null;
    this.tags = options.tags || {};
    this.metadata = options.metadata || {};
  }

  toJSON() {
    const json = {
      operation: this.operation,
      operation_type: this.operationType,
      duration_ms: this.durationMs,
      start_time: this.startTime,
      platform: this.platform,
      status: this.status,
    };

    if (this.traceId) json.trace_id = this.traceId;
    if (this.spanId) json.span_id = this.spanId;
    if (this.parentSpanId) json.parent_span_id = this.parentSpanId;
    if (this.endTime) json.end_time = this.endTime;
    if (this.httpMethod) json.http_method = this.httpMethod;
    if (this.httpUrl) json.http_url = this.httpUrl;
    if (this.httpStatusCode != null) json.http_status_code = this.httpStatusCode;
    if (this.httpHost) json.http_host = this.httpHost;
    if (this.environment) json.environment = this.environment;
    if (this.releaseVersion) json.release_version = this.releaseVersion;
    if (this.errorMessage) json.error_message = this.errorMessage;
    if (Object.keys(this.tags).length > 0) json.tags = this.tags;
    if (Object.keys(this.metadata).length > 0) json.metadata = this.metadata;

    return json;
  }

  /**
   * Create a span from an HTTP request
   */
  static fromHttpRequest(options) {
    let host = null;
    let pathname = options.url;
    try {
      const urlObj = new URL(options.url);
      host = urlObj.host;
      pathname = urlObj.pathname;
    } catch {
      pathname = (options.url || '').substring(0, 50);
    }

    const startTime = options.startTime instanceof Date
      ? options.startTime.toISOString()
      : options.startTime || new Date().toISOString();

    const startMs = options.startTime instanceof Date
      ? options.startTime.getTime()
      : new Date(options.startTime).getTime();

    const status = options.errorMessage || (options.statusCode && options.statusCode >= 400)
      ? 'error' : 'ok';

    return new PerformanceSpan({
      operation: `${options.method} ${pathname}`,
      operationType: 'http',
      httpMethod: options.method,
      httpUrl: options.url,
      httpStatusCode: options.statusCode,
      httpHost: host,
      durationMs: options.durationMs,
      startTime,
      endTime: new Date(startMs + options.durationMs).toISOString(),
      environment: options.environment,
      releaseVersion: options.releaseVersion,
      status,
      errorMessage: options.errorMessage,
      tags: options.tags || {},
    });
  }

  /**
   * Create a span for a database query
   */
  static forDbQuery(options) {
    const tags = { ...options.tags };
    tags.db_table = options.tableName;
    tags.query_type = options.queryType;
    if (options.rowsAffected !== undefined) {
      tags.rows_affected = String(options.rowsAffected);
    }

    const startTime = options.startTime instanceof Date
      ? options.startTime.toISOString()
      : options.startTime || new Date().toISOString();

    const startMs = options.startTime instanceof Date
      ? options.startTime.getTime()
      : new Date(options.startTime).getTime();

    return new PerformanceSpan({
      operation: `${options.queryType} ${options.tableName}`,
      operationType: 'db',
      durationMs: options.durationMs,
      startTime,
      endTime: new Date(startMs + options.durationMs).toISOString(),
      environment: options.environment,
      releaseVersion: options.releaseVersion,
      status: options.errorMessage ? 'error' : 'ok',
      errorMessage: options.errorMessage,
      tags,
    });
  }

  /**
   * Create a custom performance span
   */
  static custom(options) {
    const startTime = options.startTime instanceof Date
      ? options.startTime.toISOString()
      : options.startTime || new Date().toISOString();

    const startMs = options.startTime instanceof Date
      ? options.startTime.getTime()
      : new Date(options.startTime).getTime();

    return new PerformanceSpan({
      operation: options.operation,
      operationType: options.operationType || 'custom',
      durationMs: options.durationMs,
      startTime,
      endTime: new Date(startMs + options.durationMs).toISOString(),
      environment: options.environment,
      releaseVersion: options.releaseVersion,
      status: options.status || (options.errorMessage ? 'error' : 'ok'),
      errorMessage: options.errorMessage,
      tags: options.tags || {},
    });
  }
}

module.exports = { PerformanceSpan, generateTraceId, generateSpanId };
