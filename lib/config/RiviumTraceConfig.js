// lib/config/RiviumTraceConfig.js

const DEFAULT_API_URL = 'https://trace.rivium.co';
const SDK_NAME = 'rivium-trace-nodejs';
const SDK_VERSION = '0.2.0';

/**
 * SDK identity sent in the request body as `client`. The backend persists
 * client_name + client_version so the Trace dashboard can filter by SDK.
 * Matches the shape the Next.js/web SDKs send.
 */
function getClientInfo() {
  return { name: SDK_NAME, version: SDK_VERSION, platform: 'nodejs' };
}

class RiviumTraceConfig {
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('API key is required in RiviumTrace configuration');
    }
    if (!options.serverSecret) {
      throw new Error('Server secret is required for server-side operations');
    }

    this.apiKey = options.apiKey;
    this.serverSecret = options.serverSecret;
    this.apiUrl = options.apiUrl || process.env.RIVIUMTRACE_DEV_API_URL || DEFAULT_API_URL;
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.release = options.release || process.env.npm_package_version || '1.0.0';
    this.enabled = options.enabled !== false;
    this.debug = options.debug || false;
    this.timeout = options.timeout || 5000;
    this.captureUncaughtExceptions = options.captureUncaughtExceptions !== false;
    this.captureUnhandledRejections = options.captureUnhandledRejections !== false;
    this.maxBreadcrumbs = options.maxBreadcrumbs || 50;
    this.beforeSend = options.beforeSend || null; // Callback to modify errors before sending
    /**
     * Exceptions never worth reporting: a validation failure, a 404 thrown as
     * an error. Each entry is a constructor (`NotFoundError`), a class name
     * ('ValidationError'), or a RegExp matched against the name. The Laravel
     * SDK has had `ignored_exceptions`; this is the same idea.
     */
    this.ignoredExceptions = Array.isArray(options.ignoredExceptions) ? options.ignoredExceptions : [];
    /**
     * Request paths the middleware should not report or time — health checks,
     * metrics scrapes. Each entry is a glob ('/health*'), an exact path, or a
     * RegExp. Matches Laravel's `middleware.ignored_paths`.
     */
    this.ignoredPaths = Array.isArray(options.ignoredPaths) ? options.ignoredPaths : [];

    this._validate();
  }

  _validate() {
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      throw new Error('API key must be a non-empty string');
    }

    // Validate API key format
    if (!this.apiKey.startsWith('rv_live_')) {
      throw new Error('API key must start with rv_live_');
    }

    // Validate server secret format
    if (typeof this.serverSecret !== 'string' || this.serverSecret.length === 0) {
      throw new Error('Server secret must be a non-empty string');
    }
    if (!this.serverSecret.startsWith('rv_srv_')) {
      throw new Error('Server secret must start with rv_srv_');
    }

    if (this.timeout < 1000 || this.timeout > 30000) {
      throw new Error('Timeout must be between 1000ms and 30000ms');
    }

    if (this.maxBreadcrumbs < 0 || this.maxBreadcrumbs > 100) {
      throw new Error('maxBreadcrumbs must be between 0 and 100');
    }
  }

  getEndpoint() {
    return `${this.apiUrl}/api/errors`;
  }

  isEnabled() {
    return this.enabled;
  }

  /** False when the error matches `ignoredExceptions`. */
  shouldCaptureException(error) {
    if (!error || this.ignoredExceptions.length === 0) return true;

    const name = error.name || error.constructor?.name || '';
    return !this.ignoredExceptions.some((rule) => {
      if (typeof rule === 'function') return error instanceof rule;
      if (rule instanceof RegExp) return rule.test(name);
      return typeof rule === 'string' && rule === name;
    });
  }

  /** True when the path matches `ignoredPaths`. Globs use * for any run of characters. */
  shouldIgnorePath(path) {
    if (!path || this.ignoredPaths.length === 0) return false;

    return this.ignoredPaths.some((rule) => {
      if (rule instanceof RegExp) return rule.test(path);
      if (typeof rule !== 'string') return false;
      if (!rule.includes('*')) return rule === path;
      const pattern = rule
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      return new RegExp(`^${pattern}$`).test(path);
    });
  }
}

module.exports = RiviumTraceConfig;
module.exports.SDK_VERSION = SDK_VERSION;
module.exports.SDK_NAME = SDK_NAME;
module.exports.getClientInfo = getClientInfo;
