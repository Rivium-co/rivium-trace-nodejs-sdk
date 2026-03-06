// lib/middleware/ExpressMiddleware.js
const { Breadcrumb } = require('../models/Breadcrumb');

class ExpressMiddleware {
  constructor(riviumTrace) {
    this.riviumTrace = riviumTrace;
  }

  // Main middleware for request tracking
  requestHandler() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Set request context for this request
      this.riviumTrace.setRequestContext({
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        headers: req.headers,
        ip: req.ip || req.connection?.remoteAddress,
        user_agent: req.get('User-Agent')
      });

      // Add breadcrumb for the request
      this.riviumTrace.addBreadcrumb(
        Breadcrumb.http(req.method, req.originalUrl || req.url)
      );

      // Track response
      const originalSend = res.send;
      const self = this;
      res.send = function(data) {
        const duration = Date.now() - startTime;

        // Add response breadcrumb
        self.riviumTrace.addBreadcrumb(
          Breadcrumb.http(req.method, req.originalUrl || req.url, res.statusCode, duration)
        );

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // Error handling middleware
  errorHandler() {
    return (error, req, res, next) => {
      // Capture the error
      this.riviumTrace.captureException(error, {
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

      // Continue with the default error handling
      next(error);
    };
  }

  // Optional: User tracking middleware
  userMiddleware() {
    return (req, res, next) => {
      if (req.user) {
        this.riviumTrace.setUser({
          id: req.user.id,
          email: req.user.email,
          username: req.user.username || req.user.name
        });
      }
      next();
    };
  }

  // Optional: Transaction tracking for specific routes
  transactionMiddleware(transactionName) {
    return (req, res, next) => {
      const startTime = Date.now();

      this.riviumTrace.addBreadcrumb(
        Breadcrumb.custom(`Transaction started: ${transactionName}`, 'transaction', {
          transaction: transactionName,
          route: req.route?.path,
          method: req.method
        })
      );

      // Track transaction completion
      const originalSend = res.send;
      const self = this;
      res.send = function(data) {
        const duration = Date.now() - startTime;

        self.riviumTrace.addBreadcrumb(
          Breadcrumb.custom(`Transaction completed: ${transactionName}`, 'transaction', {
            transaction: transactionName,
            duration_ms: duration,
            status_code: res.statusCode,
            success: res.statusCode < 400
          })
        );

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
