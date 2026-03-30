// index.js - Main RiviumTrace SDK
const RiviumTraceConfig = require('./lib/config/RiviumTraceConfig');
const RiviumTraceError = require('./lib/models/RiviumTraceError');
const { Breadcrumb, BreadcrumbManager } = require('./lib/models/Breadcrumb');
const HttpClient = require('./lib/handlers/HttpClient');
const { createExpressMiddleware } = require('./lib/middleware/ExpressMiddleware');
const RateLimiter = require('./lib/utils/RateLimiter');
const { LogService, LogLevel, LogEntry } = require('./lib/logging/LogService');
const { PerformanceSpan, generateTraceId, generateSpanId } = require('./lib/performance/PerformanceSpan');
const { PerformanceClient } = require('./lib/performance/PerformanceClient');

class RiviumTrace {
  static _instance = null;

  constructor() {
    this._config = null;
    this._httpClient = null;
    this._breadcrumbManager = null;
    this._rateLimiter = null;
    this._isInitialized = false;
    this._requestContext = null;
    this._userContext = null;
    this._logService = null;
    this._performanceClient = null;
    this._sampleRate = 1.0;
  }

  static get instance() {
    if (!RiviumTrace._instance) {
      throw new Error('RiviumTrace not initialized. Call RiviumTrace.init() first.');
    }
    return RiviumTrace._instance;
  }

  // Initialize RiviumTrace
  static init(options) {
    RiviumTrace._instance = new RiviumTrace();
    RiviumTrace._instance._initialize(options);
    return RiviumTrace._instance;
  }

  _initialize(options) {
    this._config = new RiviumTraceConfig(options);
    this._httpClient = new HttpClient(this._config);
    this._breadcrumbManager = new BreadcrumbManager(this._config.maxBreadcrumbs);
    this._rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxErrors: 10,   // Max 10 same errors per minute
      maxTotal: 100    // Max 100 total errors per minute
    });

    this._sampleRate = options.sampleRate !== undefined ? options.sampleRate : 1.0;

    this._setupErrorHandling();
    this._isInitialized = true;

    if (this._config.debug) {
      console.log('[RiviumTrace] Initialized for Node.js', process.version);
    }
  }

  // Manually capture an exception
  static captureException(error, options = {}) {
    if (!RiviumTrace._instance?._isInitialized) return Promise.resolve();
    return RiviumTrace._instance._captureException(error, options);
  }

  async _captureException(error, options = {}) {
    // Sample rate check
    if (this._sampleRate < 1.0 && Math.random() > this._sampleRate) {
      if (this._config.debug) console.log('[RiviumTrace] Error dropped due to sample rate');
      return;
    }

    try {
      const riviumTraceError = RiviumTraceError.fromError(error, {
        environment: this._config.environment,
        release: this._config.release,
        extra: {
          ...options.extra,
          breadcrumbs: this._breadcrumbManager.getRecent(10),
          request_context: this._requestContext,
          user_context: this._userContext
        }
      });

      // Add Node.js context
      riviumTraceError.addNodeContext();

      // Apply beforeSend callback if provided
      if (this._config.beforeSend) {
        const modifiedError = this._config.beforeSend(riviumTraceError);
        if (!modifiedError) return; // Filter out this error
      }

      await this._sendError(riviumTraceError);
    } catch (err) {
      if (this._config.debug) {
        console.error('[RiviumTrace] Error capturing exception:', err);
      }
    }
  }

  // Manually capture a message
  static captureMessage(message, options = {}) {
    if (!RiviumTrace._instance?._isInitialized) return Promise.resolve();
    return RiviumTrace._instance._captureMessage(message, options);
  }

  async _captureMessage(message, options = {}) {
    // Sample rate check
    if (this._sampleRate < 1.0 && Math.random() > this._sampleRate) {
      if (this._config.debug) console.log('[RiviumTrace] Message dropped due to sample rate');
      return;
    }

    try {
      const riviumTraceError = RiviumTraceError.fromMessage(message, {
        environment: this._config.environment,
        release: this._config.release,
        extra: {
          ...options.extra,
          breadcrumbs: this._breadcrumbManager.getRecent(10),
          request_context: this._requestContext,
          user_context: this._userContext
        }
      });

      riviumTraceError.addNodeContext();

      if (this._config.beforeSend) {
        const modifiedError = this._config.beforeSend(riviumTraceError);
        if (!modifiedError) return;
      }

      await this._sendError(riviumTraceError);
    } catch (err) {
      if (this._config.debug) {
        console.error('[RiviumTrace] Error capturing message:', err);
      }
    }
  }

  // Add breadcrumb
  static addBreadcrumb(breadcrumb) {
    if (!RiviumTrace._instance?._isInitialized) return;
    RiviumTrace._instance._breadcrumbManager.add(breadcrumb);
  }

  // Set request context
  static setRequestContext(context) {
    if (!RiviumTrace._instance?._isInitialized) return;
    RiviumTrace._instance._requestContext = context;
  }

  // Set user context
  static setUser(user) {
    if (!RiviumTrace._instance?._isInitialized) return;
    RiviumTrace._instance._userContext = user;
  }

  // Express middleware
  static expressMiddleware() {
    if (!RiviumTrace._instance?._isInitialized) {
      return (req, res, next) => next(); // No-op if not initialized
    }
    return createExpressMiddleware(RiviumTrace._instance);
  }

  // Get current configuration
  static getConfig() {
    return RiviumTrace._instance?._config;
  }

  // Check if enabled
  static isEnabled() {
    return RiviumTrace._instance?._config?.isEnabled() || false;
  }

  // Setup automatic error handling
  _setupErrorHandling() {
    if (this._config.captureUncaughtExceptions) {
      process.on('uncaughtException', (error) => {
        this._handleProcessError(error, 'uncaughtException');

        // Give time to send the error before exiting
        setTimeout(() => {
          process.exit(1);
        }, 1000);
      });
    }

    if (this._config.captureUnhandledRejections) {
      process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this._handleProcessError(error, 'unhandledRejection', { promise });
      });
    }
  }

  async _handleProcessError(error, type, extra = {}) {
    try {
      const riviumTraceError = RiviumTraceError.fromError(error, {
        environment: this._config.environment,
        release: this._config.release,
        extra: {
          error_type: type,
          ...extra,
          breadcrumbs: this._breadcrumbManager.getRecent(10),
          request_context: this._requestContext,
          user_context: this._userContext
        }
      });

      riviumTraceError.addNodeContext();

      if (this._config.beforeSend) {
        const modifiedError = this._config.beforeSend(riviumTraceError);
        if (!modifiedError) return;
      }

      await this._sendError(riviumTraceError);
    } catch (err) {
      if (this._config.debug) {
        console.error('[RiviumTrace] Error handling process error:', err);
      }
    }
  }

  async _sendError(riviumTraceError) {
    if (!this._config.isEnabled()) return;

    // Check rate limiting
    const rateLimitResult = this._rateLimiter.shouldSendError(riviumTraceError);
    if (!rateLimitResult.allowed) {
      if (this._config.debug) {
        console.log(`[RiviumTrace] Rate limited: ${rateLimitResult.reason}`);
      }
      return;
    }

    // Send error
    const result = await this._httpClient.sendError(riviumTraceError);

    if (!result.success && this._config.debug) {
      console.log(`[RiviumTrace] Failed to send error: ${result.error || result.reason}`);
    }
  }

  // Utility methods for advanced usage
  static withScope(callback) {
    if (!RiviumTrace._instance?._isInitialized) return callback();

    const instance = RiviumTrace._instance;
    const originalContext = { ...instance._requestContext };
    const originalUser = { ...instance._userContext };

    try {
      return callback({
        setExtra: (key, value) => {
          if (!instance._requestContext) instance._requestContext = {};
          instance._requestContext[key] = value;
        },
        setUser: (user) => {
          instance._userContext = user;
        },
        addBreadcrumb: (breadcrumb) => {
          instance._breadcrumbManager.add(breadcrumb);
        }
      });
    } finally {
      // Restore original context
      instance._requestContext = originalContext;
      instance._userContext = originalUser;
    }
  }

  // Get current stats (useful for monitoring)
  static getStats() {
    if (!RiviumTrace._instance?._isInitialized) return null;

    return {
      isEnabled: RiviumTrace._instance._config.isEnabled(),
      breadcrumbCount: RiviumTrace._instance._breadcrumbManager.breadcrumbs.length,
      rateLimiter: RiviumTrace._instance._rateLimiter.getStats(),
      config: {
        environment: RiviumTrace._instance._config.environment,
        release: RiviumTrace._instance._config.release,
        apiKey: RiviumTrace._instance._config.apiKey.substring(0, 15) + '...'
      }
    };
  }

  // Flush pending errors (useful before shutdown)
  static async flush(timeout = 5000) {
    if (!RiviumTrace._instance?._isInitialized) return true;

    // In a real implementation, you might want to wait for pending HTTP requests
    // For now, we'll just wait a bit for any ongoing requests
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), Math.min(timeout, 1000));
    });
  }

  // ==================== PERFORMANCE ====================

  /**
   * Ensure performance client is initialized
   */
  _ensurePerformanceClient() {
    if (!this._performanceClient) {
      this._performanceClient = new PerformanceClient(this._config);
    }
    return this._performanceClient;
  }

  /**
   * Report a performance span
   * @param {PerformanceSpan} span - The span to report
   */
  static reportPerformanceSpan(span) {
    if (!RiviumTrace._instance?._isInitialized) return;
    RiviumTrace._instance._ensurePerformanceClient().reportSpan(span);
  }

  /**
   * Report multiple performance spans in a batch
   * @param {PerformanceSpan[]} spans - Array of spans to report
   */
  static reportPerformanceSpanBatch(spans) {
    if (!RiviumTrace._instance?._isInitialized) return;
    const client = RiviumTrace._instance._ensurePerformanceClient();
    for (const span of spans) {
      client.reportSpan(span);
    }
  }

  /**
   * Track an async operation with automatic timing
   * @param {string} operation - Name of the operation
   * @param {Function} fn - Async function to track
   * @param {Object} [options] - Options (operationType, tags)
   * @returns {Promise<*>} Result of the operation
   */
  static async trackOperation(operation, fn, options = {}) {
    if (!RiviumTrace._instance?._isInitialized) return fn();
    return RiviumTrace._instance._ensurePerformanceClient().trackOperation(operation, fn, options);
  }

  /**
   * Flush pending performance spans
   */
  static async flushPerformance() {
    if (!RiviumTrace._instance?._performanceClient) return;
    await RiviumTrace._instance._performanceClient.flush();
  }

  // ==================== LOGGING ====================

  /**
   * Enable logging with optional configuration
   * @param {Object} options - Logging options
   * @param {string} [options.sourceId] - Identifier for this log source
   * @param {string} [options.sourceName] - Human-readable name for this source
   * @param {number} [options.batchSize=50] - Number of logs to batch before sending
   * @param {number} [options.flushIntervalMs=5000] - How often to flush logs
   */
  static enableLogging(options = {}) {
    if (!RiviumTrace._instance?._isInitialized) return;

    const config = RiviumTrace._instance._config;
    RiviumTrace._instance._logService = new LogService({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      serverSecret: config.serverSecret,
      sourceId: options.sourceId,
      sourceName: options.sourceName,
      platform: 'nodejs',
      environment: config.environment,
      release: config.release,
      batchSize: options.batchSize || 50,
      flushIntervalMs: options.flushIntervalMs || 5000,
      debug: config.debug,
    });

    if (config.debug) {
      console.log(`[RiviumTrace] Logging enabled with sourceId: ${options.sourceId}`);
    }
  }

  /**
   * Log a message with the specified level
   * @param {string} message - The log message
   * @param {string} [level='info'] - Log level (trace, debug, info, warn, error, fatal)
   * @param {Object} [metadata] - Additional metadata
   */
  static log(message, level = LogLevel.INFO, metadata = null) {
    if (!RiviumTrace._instance?._isInitialized) return;

    // Auto-enable logging if not already enabled
    if (!RiviumTrace._instance._logService) {
      RiviumTrace.enableLogging();
    }

    const userId = RiviumTrace._instance._userContext?.id || null;
    RiviumTrace._instance._logService?.log(message, level, metadata, userId);
  }

  /**
   * Log a trace-level message
   */
  static trace(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.TRACE, metadata);
  }

  /**
   * Log a debug-level message
   */
  static logDebug(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.DEBUG, metadata);
  }

  /**
   * Log an info-level message
   */
  static info(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.INFO, metadata);
  }

  /**
   * Log a warning-level message
   */
  static warn(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.WARN, metadata);
  }

  /**
   * Log an error-level message (for non-exception errors)
   */
  static logError(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.ERROR, metadata);
  }

  /**
   * Log a fatal-level message
   */
  static fatal(message, metadata = null) {
    RiviumTrace.log(message, LogLevel.FATAL, metadata);
  }

  /**
   * Flush all pending logs immediately
   * @returns {Promise<boolean>}
   */
  static async flushLogs() {
    if (!RiviumTrace._instance?._logService) return true;
    return RiviumTrace._instance._logService.flush();
  }

  /**
   * Get the number of logs currently buffered
   * @returns {number}
   */
  static get pendingLogCount() {
    return RiviumTrace._instance?._logService?.bufferSize || 0;
  }

  // Close and cleanup
  static async close() {
    if (RiviumTrace._instance) {
      // Flush and dispose log service
      if (RiviumTrace._instance._logService) {
        await RiviumTrace._instance._logService.dispose();
      }

      // Flush and dispose performance client
      if (RiviumTrace._instance._performanceClient) {
        await RiviumTrace._instance._performanceClient.dispose();
      }

      RiviumTrace._instance._breadcrumbManager?.clear();
      RiviumTrace._instance._requestContext = null;
      RiviumTrace._instance._userContext = null;
      RiviumTrace._instance._rateLimiter?.reset();
      RiviumTrace._instance = null;
    }
  }
}

// Export static methods for convenience
module.exports = RiviumTrace;

// Also export classes for advanced usage
module.exports.RiviumTraceConfig = RiviumTraceConfig;
module.exports.RiviumTraceError = RiviumTraceError;
module.exports.Breadcrumb = Breadcrumb;
module.exports.BreadcrumbManager = BreadcrumbManager;
module.exports.LogService = LogService;
module.exports.LogLevel = LogLevel;
module.exports.LogEntry = LogEntry;
module.exports.PerformanceSpan = PerformanceSpan;
module.exports.PerformanceClient = PerformanceClient;
module.exports.generateTraceId = generateTraceId;
module.exports.generateSpanId = generateSpanId;
