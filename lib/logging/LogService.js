const https = require('https');
const http = require('http');
const { URL } = require('url');
const { LogLevel, LogEntry } = require('./LogEntry');

/**
 * Service for batching and sending logs to RiviumTrace
 *
 * Features (matching Better Stack/Logtail):
 * - Lazy timer: only runs when buffer has logs
 * - Exponential backoff: retries with increasing delays (1s, 2s, 4s, 8s...)
 * - Max buffer size: drops oldest logs when buffer exceeds limit
 */
class LogService {
  constructor({
    apiKey,
    apiUrl = 'https://trace.rivium.co',
    serverSecret = null,
    sourceId = null,
    sourceName = null,
    platform = 'nodejs',
    environment = 'production',
    release = null,
    batchSize = 50,
    flushIntervalMs = 30000,
    maxBufferSize = 1000,
    debug = false,
  }) {
    this.apiKey = apiKey;
    this.serverSecret = serverSecret;
    this.sourceId = sourceId;
    this.sourceName = sourceName;
    this.platform = platform;
    this.environment = environment;
    this.release = release;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBufferSize = maxBufferSize;
    this.apiEndpoint = apiUrl;
    this.debug = debug;

    this.buffer = [];
    this.isFlushing = false;
    this.flushTimer = null;
    this.retryAttempt = 0;

    // Exponential backoff constants
    this.baseRetryDelayMs = 1000;
    this.maxRetryDelayMs = 60000;
    this.maxRetryAttempts = 10;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  _getRetryDelay() {
    const delay = this.baseRetryDelayMs * Math.pow(2, this.retryAttempt);
    return Math.min(delay, this.maxRetryDelayMs);
  }

  /**
   * Enforce max buffer size by dropping oldest logs
   */
  _enforceMaxBufferSize() {
    if (this.buffer.length > this.maxBufferSize) {
      const dropCount = this.buffer.length - this.maxBufferSize;
      this.buffer.splice(0, dropCount);
      if (this.debug) {
        console.warn(`[RiviumTrace] Buffer overflow: dropped ${dropCount} oldest logs`);
      }
    }
  }

  /**
   * Schedule a one-shot flush timer (only if buffer has logs)
   */
  _scheduleFlush() {
    // Cancel existing timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Only schedule if there are logs to send
    if (this.buffer.length > 0) {
      // Use exponential backoff delay if retrying, otherwise normal interval
      const delay = this.retryAttempt > 0 ? this._getRetryDelay() : this.flushIntervalMs;

      this.flushTimer = setTimeout(() => this.flush(), delay);
    }
  }

  /**
   * Add a log entry to the buffer
   */
  add(entry) {
    if (!(entry instanceof LogEntry)) {
      entry = new LogEntry(entry);
    }
    this.buffer.push(entry);

    // Enforce max buffer size (drop oldest if exceeds limit)
    this._enforceMaxBufferSize();

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // Schedule flush only if timer isn't already running
      this._scheduleFlush();
    }
  }

  /**
   * Add a log with convenience parameters
   */
  log(message, level = LogLevel.INFO, metadata = null, userId = null) {
    this.add(new LogEntry({
      message,
      level,
      timestamp: new Date(),
      metadata,
      userId,
    }));
  }

  /**
   * Send a single log immediately (bypasses batching)
   */
  async sendImmediate(entry) {
    const payload = {
      ...entry.toJSON(),
      platform: this.platform,
      environment: this.environment,
      sourceType: 'sdk',
    };

    if (this.release) payload.release = this.release;
    if (this.sourceId) payload.sourceId = this.sourceId;
    if (this.sourceName) payload.sourceName = this.sourceName;

    return this._sendRequest('/api/logs/ingest', payload);
  }

  /**
   * Flush all buffered logs to the server
   */
  async flush() {
    // Cancel timer since we're flushing now
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || this.isFlushing) {
      return true;
    }

    this.isFlushing = true;
    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      // If no sourceId, send individual logs
      if (!this.sourceId) {
        let allSucceeded = true;
        for (const entry of logsToSend) {
          const success = await this.sendImmediate(entry);
          if (!success) allSucceeded = false;
        }
        this.isFlushing = false;
        return allSucceeded;
      }

      // Batch send
      const logs = logsToSend.map((entry) => ({
        ...entry.toJSON(),
        platform: this.platform,
        environment: this.environment,
        ...(this.release && { release: this.release }),
      }));

      const payload = {
        sourceId: this.sourceId,
        sourceType: 'sdk',
        logs,
      };

      if (this.sourceName) {
        payload.sourceName = this.sourceName;
      }

      const success = await this._sendRequest('/api/logs/ingest/batch', payload);

      if (success) {
        this.retryAttempt = 0; // Reset on success
      } else {
        // Put logs back in buffer for retry
        this.buffer = [...logsToSend, ...this.buffer];
        this._enforceMaxBufferSize(); // Don't exceed max when re-adding
        // Increment retry attempt and schedule with backoff
        if (this.retryAttempt < this.maxRetryAttempts) {
          this.retryAttempt++;
          this._scheduleFlush();
        } else {
          if (this.debug) {
            console.error('[RiviumTrace] Max retry attempts reached, logs will be dropped');
          }
          this.retryAttempt = 0;
        }
      }

      this.isFlushing = false;
      return success;
    } catch (error) {
      // Put logs back in buffer for retry
      this.buffer = [...logsToSend, ...this.buffer];
      this._enforceMaxBufferSize(); // Don't exceed max when re-adding
      // Increment retry attempt and schedule with backoff
      if (this.retryAttempt < this.maxRetryAttempts) {
        this.retryAttempt++;
        this._scheduleFlush();
      } else {
        if (this.debug) {
          console.error('[RiviumTrace] Max retry attempts reached, logs will be dropped');
        }
        this.retryAttempt = 0;
      }
      if (this.debug) {
        console.error('[RiviumTrace] Error flushing logs:', error.message);
      }
      this.isFlushing = false;
      return false;
    }
  }

  /**
   * Get the number of buffered logs
   */
  get bufferSize() {
    return this.buffer.length;
  }

  /**
   * Dispose the service
   */
  dispose() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this.flush();
  }

  /**
   * Send HTTP request
   */
  _sendRequest(endpoint, payload) {
    return new Promise((resolve) => {
      try {
        const url = new URL(endpoint, this.apiEndpoint);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;

        const os = require('os');
        const { SDK_VERSION } = require('../config/RiviumTraceConfig');

        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'x-server-secret': this.serverSecret,
            'User-Agent': `RiviumTrace-SDK/${SDK_VERSION} (nodejs; ${os.platform()}; Node.js ${process.version})`,
          },
          timeout: 30000,
        };

        const req = transport.request(options, (res) => {
          let data = ''; // eslint-disable-line no-unused-vars
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const success = res.statusCode >= 200 && res.statusCode < 300;
            if (this.debug) {
              if (success) {
                console.log('[RiviumTrace] Logs sent successfully');
              } else {
                console.warn(`[RiviumTrace] Failed to send logs: ${res.statusCode}`);
              }
            }
            resolve(success);
          });
        });

        req.on('error', (error) => {
          if (this.debug) {
            console.error('[RiviumTrace] Error sending logs:', error.message);
          }
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          if (this.debug) {
            console.error('[RiviumTrace] Request timeout');
          }
          resolve(false);
        });

        req.write(JSON.stringify(payload));
        req.end();
      } catch (error) {
        if (this.debug) {
          console.error('[RiviumTrace] Error sending logs:', error.message);
        }
        resolve(false);
      }
    });
  }
}

module.exports = { LogService, LogLevel, LogEntry };
