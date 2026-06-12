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

class ExpressMiddleware {
  constructor(riviumTrace) {
    // Kept for backwards compatibility. We no longer rely on instance methods
    // off this reference — all calls go through the static API resolved lazily.
    this.riviumTrace = riviumTrace;
  }

  // Main middleware for request tracking
  requestHandler() {
    return (req, res, next) => {
      const startTime = Date.now();
      const RT = getRiviumTrace();

      try {
        RT.setRequestContext({
          method: req.method,
          url: req.url,
          originalUrl: req.originalUrl,
          headers: req.headers,
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
      try {
        getRiviumTrace().captureException(error, {
          extra: {
            request: {
              method: req.method,
              url: req.originalUrl || req.url,
              headers: req.headers,
              body: req.body,
              query: req.query,
              params: req.params,
              ip: req.ip || req.connection?.remoteAddress
            },
            response: {
              statusCode: res.statusCode
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

module.exports = { ExpressMiddleware, createExpressMiddleware };
