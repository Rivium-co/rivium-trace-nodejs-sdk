// lib/middleware/ExpressMiddleware.js
const { Breadcrumb } = require('../models/Breadcrumb');

// captureException, setRequestContext, addBreadcrumb, and setUser are all
// declared as STATIC methods on the RiviumTrace class — they do not exist on
// instances. The middleware used to call them via `this.riviumTrace.xxx(...)`,
// which threw `xxx is not a function` because `this.riviumTrace` was the
// singleton instance, not the class.
//
// We resolve the RiviumTrace class lazily on first use to avoid a circular
// `require` with index.js. Calling the static API directly is both correct
// and tolerant of how callers construct the middleware (class or instance).
let _RiviumTraceClass = null;
function getRiviumTrace() {
  if (_RiviumTraceClass) return _RiviumTraceClass;
  // Lazy require dodges the circular dep (index.js -> middleware -> index.js).
  _RiviumTraceClass = require('../../index.js');
  return _RiviumTraceClass;
}

/** Keys whose values are never sent (passwords, tokens, secrets). */
const SENSITIVE = /pass(word)?|secret|token|auth|api[-_]?key|session|cookie|signature|otp|code/i;

/** A shallow copy of query / params with sensitive values replaced. */
function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = SENSITIVE.test(k) ? '[REDACTED]' : v;
  return out;
}

/** The request path without the query string ("/users/42"). */
function pathOf(req) {
  const raw = req.originalUrl || req.url || '';
  return String(raw).split('?')[0] || undefined;
}

/**
 * The matched Express route template ("/users/:id"), including the mount path
 * of the router it lives in. Undefined when no route matched (e.g. a 404, or an
 * error thrown by app-level middleware).
 */
function routeOf(req) {
  const path = req.route && req.route.path;
  if (typeof path !== 'string') return undefined;
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${base}${path}` || '/';
}

/**
 * The status the response is going to get. In an error handler `res.statusCode`
 * is usually still 200: Express's final handler sets it afterwards from
 * `err.status` / `err.statusCode` (4xx/5xx) or 500. Mirror that.
 */
function statusOf(error, res) {
  const fromError = error && (error.status || error.statusCode);
  if (Number.isInteger(fromError) && fromError >= 400 && fromError < 600) return fromError;
  if (res && Number.isInteger(res.statusCode) && res.statusCode >= 400) return res.statusCode;
  return 500;
}

class ExpressMiddleware {
  constructor(riviumTrace) {
    // Kept for backwards compatibility. We no longer rely on instance methods
    // off this reference — all calls go through the static API resolved lazily.
    this.riviumTrace = riviumTrace;
  }

  /** Paths the config says to leave alone — health checks, metrics scrapes. */
  _ignored(req) {
    try {
      const config = getRiviumTrace().getConfig?.();
      const path = req.path || req.originalUrl || req.url || '';
      return config?.shouldIgnorePath?.(path.split('?')[0]) === true;
    } catch (_) {
      return false;
    }
  }

  // Main middleware for request tracking
  requestHandler() {
    return (req, res, next) => {
      const startTime = Date.now();
      const RT = getRiviumTrace();

      if (this._ignored(req)) return next();

      try {
        RT.setRequestContext({
          method: req.method,
          url: req.url,
          originalUrl: req.originalUrl,
          path: pathOf(req),
          ip: req.ip || req.connection?.remoteAddress,
          user_agent: req.get('User-Agent')
        });

        RT.addBreadcrumb(
          Breadcrumb.http(req.method, req.originalUrl || req.url)
        );
      } catch (_) {
        // Telemetry must never crash a request.
      }

      // Track response — wrap res.send to record duration + status in a breadcrumb.
      const originalSend = res.send;
      res.send = function (data) {
        try {
          const duration = Date.now() - startTime;
          RT.addBreadcrumb(
            Breadcrumb.http(req.method, req.originalUrl || req.url, res.statusCode, duration)
          );
        } catch (_) {
          // Telemetry must never affect the response.
        }
        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Error handling middleware
  errorHandler() {
    return (error, req, res, next) => {
      if (this._ignored(req)) return next(error);

      try {
        getRiviumTrace().captureException(error, {
          extra: {
            request: {
              method: req.method,
              url: req.originalUrl || req.url,
              path: pathOf(req),
              route: routeOf(req),
              // No headers or body: they carry cookies, tokens and form data.
              query: redact(req.query),
              params: redact(req.params),
              user_agent: req.get ? req.get('User-Agent') : undefined,
              ip: req.ip || req.connection?.remoteAddress
            },
            response: {
              statusCode: statusOf(error, res)
            }
          }
        });
      } catch (_) {
        // Never let telemetry mask the original error.
      }
      next(error);
    };
  }

  // Optional: User tracking middleware
  userMiddleware() {
    return (req, res, next) => {
      if (req.user) {
        try {
          getRiviumTrace().setUser({
            id: req.user.id,
            email: req.user.email,
            username: req.user.username || req.user.name
          });
        } catch (_) {
          // Telemetry must never affect the response.
        }
      }
      next();
    };
  }

  // Optional: Transaction tracking for specific routes
  transactionMiddleware(transactionName) {
    return (req, res, next) => {
      const startTime = Date.now();
      const RT = getRiviumTrace();

      try {
        RT.addBreadcrumb(
          Breadcrumb.custom(`Transaction started: ${transactionName}`, 'transaction', {
            transaction: transactionName,
            route: req.route?.path,
            method: req.method
          })
        );
      } catch (_) {
        // Telemetry must never affect the response.
      }

      const originalSend = res.send;
      res.send = function (data) {
        try {
          const duration = Date.now() - startTime;
          RT.addBreadcrumb(
            Breadcrumb.custom(`Transaction completed: ${transactionName}`, 'transaction', {
              transaction: transactionName,
              duration_ms: duration,
              status_code: res.statusCode,
              success: res.statusCode < 400
            })
          );
        } catch (_) {
          // Telemetry must never affect the response.
        }
        return originalSend.call(this, data);
      };

      next();
    };
  }
}

// Factory function for easy use
function createExpressMiddleware(riviumTrace) {
  return new ExpressMiddleware(riviumTrace);
}

module.exports = { ExpressMiddleware, createExpressMiddleware, _internal: { pathOf, routeOf, statusOf } };
