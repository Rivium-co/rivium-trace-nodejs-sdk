// lib/utils/RateLimiter.js
const crypto = require('crypto');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxErrors = options.maxErrors || 10; // Max 10 same errors per minute
    this.maxTotal = options.maxTotal || 100; // Max 100 total errors per minute
    this.errorTimes = new Map(); // Track individual error times
    this.totalErrors = []; // Track all error times
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    
    this._startCleanup();
  }

  // Check if error should be sent (not rate limited)
  shouldSendError(riviumTraceError) {
    const now = Date.now();
    const errorKey = this._generateErrorKey(riviumTraceError);

    // Check total rate limit first
    if (!this._checkTotalLimit(now)) {
      return { allowed: false, reason: 'total_limit_exceeded' };
    }

    // Check individual error rate limit
    if (!this._checkErrorLimit(errorKey, now)) {
      return { allowed: false, reason: 'error_limit_exceeded' };
    }

    // Record this error
    this._recordError(errorKey, now);
    
    return { allowed: true };
  }

  _checkTotalLimit(now) {
    // Remove old entries
    this.totalErrors = this.totalErrors.filter(time => now - time < this.windowMs);
    
    // Check if under limit
    return this.totalErrors.length < this.maxTotal;
  }

  _checkErrorLimit(errorKey, now) {
    const errorTimes = this.errorTimes.get(errorKey) || [];
    
    // Remove old entries
    const recentTimes = errorTimes.filter(time => now - time < this.windowMs);
    
    // Update the map
    if (recentTimes.length === 0) {
      this.errorTimes.delete(errorKey);
    } else {
      this.errorTimes.set(errorKey, recentTimes);
    }
    
    // Check if under limit
    return recentTimes.length < this.maxErrors;
  }

  _recordError(errorKey, now) {
    // Record total error
    this.totalErrors.push(now);
    
    // Record individual error
    const errorTimes = this.errorTimes.get(errorKey) || [];
    errorTimes.push(now);
    this.errorTimes.set(errorKey, errorTimes);
  }

  _generateErrorKey(riviumTraceError) {
    // Create a unique key for similar errors
    const keyData = `${riviumTraceError.message}_${riviumTraceError.platform}_${riviumTraceError.environment}`;
    return crypto.createHash('md5').update(keyData).digest('hex');
  }

  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);
    this._cleanupTimer.unref();
  }

  _cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Clean up total errors
    this.totalErrors = this.totalErrors.filter(time => time > cutoff);

    // Clean up individual error tracking
    for (const [errorKey, times] of this.errorTimes.entries()) {
      const recentTimes = times.filter(time => time > cutoff);
      
      if (recentTimes.length === 0) {
        this.errorTimes.delete(errorKey);
      } else {
        this.errorTimes.set(errorKey, recentTimes);
      }
    }

    // Prevent memory leaks by limiting map size
    if (this.errorTimes.size > 1000) {
      // Keep only the 500 most recent error types
      const entries = Array.from(this.errorTimes.entries());
      entries.sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]));
      
      this.errorTimes.clear();
      entries.slice(0, 500).forEach(([key, times]) => {
        this.errorTimes.set(key, times);
      });
    }
  }

  // Get current stats (useful for debugging)
  getStats() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    const recentTotal = this.totalErrors.filter(time => time > cutoff).length;
    const uniqueErrors = Array.from(this.errorTimes.entries())
      .filter(([_, times]) => times.some(time => time > cutoff))
      .length;

    return {
      totalErrorsInWindow: recentTotal,
      uniqueErrorsInWindow: uniqueErrors,
      totalLimit: this.maxTotal,
      errorLimit: this.maxErrors,
      windowMs: this.windowMs
    };
  }

  // Reset all limits (useful for testing)
  reset() {
    this.errorTimes.clear();
    this.totalErrors = [];
  }
}

module.exports = RateLimiter;