/**
 * Log levels for RiviumTrace logging
 */
const LogLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
};

/**
 * A single log entry to be sent to RiviumTrace
 */
class LogEntry {
  constructor({ message, level = LogLevel.INFO, timestamp = new Date(), metadata = null, userId = null }) {
    this.message = message;
    this.level = level;
    this.timestamp = timestamp;
    this.metadata = metadata;
    this.userId = userId;
  }

  toJSON() {
    return {
      message: this.message,
      level: this.level,
      timestamp: this.timestamp.toISOString(),
      ...(this.metadata && { metadata: this.metadata }),
      ...(this.userId && { userId: this.userId }),
    };
  }
}

module.exports = { LogLevel, LogEntry };
