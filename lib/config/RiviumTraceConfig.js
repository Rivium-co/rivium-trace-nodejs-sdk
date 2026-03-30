// lib/config/RiviumTraceConfig.js

const DEFAULT_API_URL = 'https://trace.rivium.co';
const SDK_VERSION = '0.1.0';

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

    this._validate();
  }

  _validate() {
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      throw new Error('API key must be a non-empty string');
    }

    // Validate API key format
    if (!this.apiKey.startsWith('rv_live_') && !this.apiKey.startsWith('rv_test_')) {
      throw new Error('API key must start with rv_live_ or rv_test_');
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

  shouldCaptureException(_error) {
    // Add logic to filter out certain errors if needed
    return true;
  }
}

module.exports = RiviumTraceConfig;
module.exports.SDK_VERSION = SDK_VERSION;
