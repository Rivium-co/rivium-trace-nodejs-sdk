// lib/models/Breadcrumb.js
class Breadcrumb {
  constructor(options = {}) {
    this.timestamp = options.timestamp || new Date().toISOString();
    this.message = options.message || '';
    this.category = options.category || 'manual';
    this.level = options.level || 'info';
    this.data = options.data || {};
  }

  // Create HTTP request breadcrumb
  static http(method, url, statusCode, duration) {
    return new Breadcrumb({
      message: `${method} ${url}`,
      category: 'http',
      level: statusCode >= 400 ? 'error' : 'info',
      data: {
        method,
        url,
        status_code: statusCode,
        duration_ms: duration
      }
    });
  }

  // Create database query breadcrumb
  static database(query, duration, error = null) {
    return new Breadcrumb({
      message: `Database query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`,
      category: 'database',
      level: error ? 'error' : 'info',
      data: {
        query: query.substring(0, 500), // Limit query length
        duration_ms: duration,
        error: error?.message
      }
    });
  }

  // Create console log breadcrumb
  static console(level, message, ...args) {
    return new Breadcrumb({
      message: `Console.${level}: ${message}`,
      category: 'console',
      level: level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
      data: {
        arguments: args.length > 0 ? args : undefined
      }
    });
  }

  // Create navigation breadcrumb (for Express routes)
  static navigation(from, to, method = 'GET') {
    return new Breadcrumb({
      message: `${method} ${to}`,
      category: 'navigation',
      level: 'info',
      data: {
        from,
        to,
        method
      }
    });
  }

  // Create user action breadcrumb
  static user(action, data = {}) {
    return new Breadcrumb({
      message: `User action: ${action}`,
      category: 'user',
      level: 'info',
      data
    });
  }

  // Create custom breadcrumb
  static custom(message, category, data = {}) {
    return new Breadcrumb({
      message,
      category,
      level: 'info',
      data
    });
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      message: this.message,
      category: this.category,
      level: this.level,
      data: this.data
    };
  }
}

// Breadcrumb manager to handle the breadcrumb array
class BreadcrumbManager {
  constructor(maxBreadcrumbs = 50) {
    this.breadcrumbs = [];
    this.maxBreadcrumbs = maxBreadcrumbs;
  }

  add(breadcrumb) {
    if (!(breadcrumb instanceof Breadcrumb)) {
      breadcrumb = new Breadcrumb(breadcrumb);
    }

    this.breadcrumbs.push(breadcrumb);

    // Keep only the latest breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  clear() {
    this.breadcrumbs = [];
  }

  getAll() {
    return this.breadcrumbs.slice(); // Return copy
  }

  getRecent(count = 10) {
    return this.breadcrumbs.slice(-count);
  }

  toJSON() {
    return this.breadcrumbs.map(b => b.toJSON());
  }
}

module.exports = { Breadcrumb, BreadcrumbManager };