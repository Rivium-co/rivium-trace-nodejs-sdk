// lib/performance/PerformanceClient.js
const https = require('https');
const http = require('http');

class PerformanceClient {
  constructor(config) {
    this.config = config;
    this.spanBuffer = [];
    this.flushTimer = null;
    this.batchSize = 10;
    this.flushInterval = 5000;
  }

  /**
   * Report a single performance span
   */
  reportSpan(span) {
    this.spanBuffer.push(span);

    if (this.spanBuffer.length >= this.batchSize) {
      this.flush();
    } else {
      this._scheduleFlush();
    }
  }

  /**
   * Track an async operation with automatic timing
   */
  async trackOperation(operation, fn, options = {}) {
    const startTime = new Date();

    try {
      const result = await fn();
      const durationMs = Date.now() - startTime.getTime();

      const { PerformanceSpan } = require('./PerformanceSpan');
      this.reportSpan(new PerformanceSpan({
        operation,
        operationType: options.operationType || 'custom',
        durationMs,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        environment: this.config.environment,
        releaseVersion: this.config.release,
        tags: options.tags || {},
        status: 'ok',
      }));

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime.getTime();

      const { PerformanceSpan } = require('./PerformanceSpan');
      this.reportSpan(new PerformanceSpan({
        operation,
        operationType: options.operationType || 'custom',
        durationMs,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        environment: this.config.environment,
        releaseVersion: this.config.release,
        tags: options.tags || {},
        status: 'error',
        errorMessage: error.message || String(error),
      }));

      throw error;
    }
  }

  _scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.spanBuffer.length === 0) return;

    const spans = [...this.spanBuffer];
    this.spanBuffer = [];

    try {
      const url = `${this.config.apiUrl}/api/performance/spans/batch`;
      const payload = JSON.stringify({
        spans: spans.map(s => typeof s.toJSON === 'function' ? s.toJSON() : s),
      });

      await this._makeRequest(url, payload);

      if (this.config.debug) {
        console.log(`[RiviumTrace] Sent ${spans.length} performance spans`);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[RiviumTrace] Error sending performance spans:', error.message);
      }

      // Re-add failed spans (up to limit)
      const maxBuffer = this.batchSize * 5;
      this.spanBuffer = [...spans, ...this.spanBuffer].slice(0, maxBuffer);
    }
  }

  _makeRequest(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': this.config.apiKey,
          'x-server-secret': this.config.serverSecret,
        },
        timeout: this.config.timeout || 5000,
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    });
  }

  dispose() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this.flush();
  }
}

module.exports = { PerformanceClient };
