// lib/models/RiviumTraceError.js
class RiviumTraceError {
  constructor(options = {}) {
    this.message = options.message || 'Unknown error';
    this.stack_trace = options.stack_trace || '';
    this.platform = 'nodejs';
    this.environment = options.environment || 'development';
    const { SDK_VERSION } = require('../config/RiviumTraceConfig');
    this.release = options.release || SDK_VERSION;
    this.timestamp = options.timestamp || new Date().toISOString();
    this.extra = options.extra || {};
    this.user_agent = options.user_agent || this._generateUserAgent();
    this.url = options.url || '';
  }

  _generateUserAgent() {
    const os = require('os');
    const { SDK_VERSION } = require('../config/RiviumTraceConfig');
    return `RiviumTrace-SDK/${SDK_VERSION} (nodejs; ${os.platform()}; Node.js ${process.version})`;
  }

  // Convert to the format your backend expects
  toJSON() {
    // Extract breadcrumbs from extra to root level (backend expects them at root)
    const extra = this.extra ? { ...this.extra } : {};
    const breadcrumbs = extra.breadcrumbs;
    delete extra.breadcrumbs;

    return {
      message: this.message,
      stack_trace: this.stack_trace,
      platform: this.platform,
      environment: this.environment,
      release_version: this.release,
      timestamp: this.timestamp,
      ...(breadcrumbs && { breadcrumbs }),
      ...(Object.keys(extra).length > 0 && { extra }),
      user_agent: this.user_agent,
      url: this.url
    };
  }

  // Create from JavaScript Error object
  static fromError(error, options = {}) {
    return new RiviumTraceError({
      message: error.message || String(error),
      stack_trace: error.stack || new Error().stack,
      environment: options.environment,
      release: options.release,
      extra: options.extra,
      url: options.url,
      timestamp: new Date().toISOString()
    });
  }

  // Create from message string
  static fromMessage(message, options = {}) {
    return new RiviumTraceError({
      message: message,
      stack_trace: new Error().stack,
      environment: options.environment,
      release: options.release,
      extra: options.extra,
      url: options.url,
      timestamp: new Date().toISOString()
    });
  }

  // Add extra context
  setExtra(key, value) {
    this.extra[key] = value;
    return this;
  }

  // Set multiple extra fields
  setExtras(extras) {
    Object.assign(this.extra, extras);
    return this;
  }

  // Add request context (useful for Express)
  setRequestContext(req) {
    if (req) {
      this.extra.request = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        ip: req.ip || req.connection?.remoteAddress,
        query: req.query,
        params: req.params
      };
      this.url = req.url;
      this.user_agent = req.get ? req.get('User-Agent') : req.headers['user-agent'];
    }
    return this;
  }

  // Add Node.js specific context
  addNodeContext() {
    const os = require('os');
    this.extra.node_context = {
      node_version: process.version,
      platform: os.platform(),
      arch: os.arch(),
      memory_usage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    };
    return this;
  }
}

module.exports = RiviumTraceError;
