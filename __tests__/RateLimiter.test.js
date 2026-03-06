const RateLimiter = require('../lib/utils/RateLimiter');

// Fake error-like object that has the properties _generateErrorKey uses
function makeError(message, platform = 'nodejs', environment = 'development') {
  return { message, platform, environment };
}

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new RateLimiter({
      windowMs: 60000,
      maxErrors: 3,
      maxTotal: 10,
      cleanupInterval: 300000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Constructor Defaults ─────────────────────────────────────────

  describe('constructor', () => {
    test('uses default windowMs of 60000', () => {
      const l = new RateLimiter();
      expect(l.windowMs).toBe(60000);
    });

    test('uses default maxErrors of 10', () => {
      const l = new RateLimiter();
      expect(l.maxErrors).toBe(10);
    });

    test('uses default maxTotal of 100', () => {
      const l = new RateLimiter();
      expect(l.maxTotal).toBe(100);
    });

    test('uses default cleanupInterval of 300000', () => {
      const l = new RateLimiter();
      expect(l.cleanupInterval).toBe(300000);
    });

    test('accepts custom options', () => {
      expect(limiter.windowMs).toBe(60000);
      expect(limiter.maxErrors).toBe(3);
      expect(limiter.maxTotal).toBe(10);
    });
  });

  // ─── shouldSendError ──────────────────────────────────────────────

  describe('shouldSendError()', () => {
    test('allows the first error', () => {
      const result = limiter.shouldSendError(makeError('err1'));
      expect(result).toEqual({ allowed: true });
    });

    test('allows errors up to the per-error limit', () => {
      const err = makeError('repeated');
      expect(limiter.shouldSendError(err).allowed).toBe(true);
      expect(limiter.shouldSendError(err).allowed).toBe(true);
      expect(limiter.shouldSendError(err).allowed).toBe(true);
    });

    test('blocks the same error after exceeding per-error limit', () => {
      const err = makeError('repeated');
      // Send maxErrors (3) errors
      for (let i = 0; i < 3; i++) {
        limiter.shouldSendError(err);
      }
      const result = limiter.shouldSendError(err);
      expect(result).toEqual({ allowed: false, reason: 'error_limit_exceeded' });
    });

    test('different errors have independent limits', () => {
      const err1 = makeError('error-A');
      const err2 = makeError('error-B');

      for (let i = 0; i < 3; i++) {
        limiter.shouldSendError(err1);
      }
      // err1 is now limited, but err2 should still be allowed
      expect(limiter.shouldSendError(err1).allowed).toBe(false);
      expect(limiter.shouldSendError(err2).allowed).toBe(true);
    });

    test('blocks all errors after total limit is reached', () => {
      // Send 10 different errors (maxTotal = 10)
      for (let i = 0; i < 10; i++) {
        limiter.shouldSendError(makeError(`unique-${i}`));
      }
      // The 11th error should be blocked
      const result = limiter.shouldSendError(makeError('one-more'));
      expect(result).toEqual({ allowed: false, reason: 'total_limit_exceeded' });
    });

    test('total limit check happens before per-error check', () => {
      // Fill up total limit with unique errors
      for (let i = 0; i < 10; i++) {
        limiter.shouldSendError(makeError(`unique-${i}`));
      }
      // Even a brand new error should get total_limit_exceeded, not error_limit_exceeded
      const result = limiter.shouldSendError(makeError('brand-new'));
      expect(result.reason).toBe('total_limit_exceeded');
    });
  });

  // ─── Window Expiration ────────────────────────────────────────────

  describe('window expiration', () => {
    test('allows same error again after window expires', () => {
      const err = makeError('windowed');
      for (let i = 0; i < 3; i++) {
        limiter.shouldSendError(err);
      }
      expect(limiter.shouldSendError(err).allowed).toBe(false);

      // Advance past the window
      jest.advanceTimersByTime(61000);

      expect(limiter.shouldSendError(err).allowed).toBe(true);
    });

    test('total limit resets after window expires', () => {
      for (let i = 0; i < 10; i++) {
        limiter.shouldSendError(makeError(`fill-${i}`));
      }
      expect(limiter.shouldSendError(makeError('blocked')).allowed).toBe(false);

      jest.advanceTimersByTime(61000);

      expect(limiter.shouldSendError(makeError('now-allowed')).allowed).toBe(true);
    });
  });

  // ─── _generateErrorKey ────────────────────────────────────────────

  describe('_generateErrorKey()', () => {
    test('generates consistent keys for same input', () => {
      const err = makeError('test', 'nodejs', 'production');
      const key1 = limiter._generateErrorKey(err);
      const key2 = limiter._generateErrorKey(err);
      expect(key1).toBe(key2);
    });

    test('generates different keys for different messages', () => {
      const key1 = limiter._generateErrorKey(makeError('error-A'));
      const key2 = limiter._generateErrorKey(makeError('error-B'));
      expect(key1).not.toBe(key2);
    });

    test('generates different keys for different environments', () => {
      const key1 = limiter._generateErrorKey(makeError('same', 'nodejs', 'dev'));
      const key2 = limiter._generateErrorKey(makeError('same', 'nodejs', 'prod'));
      expect(key1).not.toBe(key2);
    });

    test('returns an MD5 hex hash (32 chars)', () => {
      const key = limiter._generateErrorKey(makeError('test'));
      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  // ─── _cleanup ─────────────────────────────────────────────────────

  describe('_cleanup()', () => {
    test('removes expired entries from totalErrors', () => {
      limiter.shouldSendError(makeError('old'));

      // Advance past window
      jest.advanceTimersByTime(61000);
      limiter._cleanup();

      expect(limiter.totalErrors).toHaveLength(0);
    });

    test('removes expired entries from errorTimes map', () => {
      limiter.shouldSendError(makeError('old'));

      jest.advanceTimersByTime(61000);
      limiter._cleanup();

      expect(limiter.errorTimes.size).toBe(0);
    });

    test('keeps entries within window', () => {
      limiter.shouldSendError(makeError('recent'));
      limiter._cleanup();

      expect(limiter.totalErrors).toHaveLength(1);
      expect(limiter.errorTimes.size).toBe(1);
    });

    test('limits errorTimes map to 500 entries when exceeding 1000', () => {
      // Manually fill the map with > 1000 entries
      for (let i = 0; i < 1050; i++) {
        limiter.errorTimes.set(`key-${i}`, [Date.now()]);
      }
      expect(limiter.errorTimes.size).toBe(1050);

      limiter._cleanup();

      expect(limiter.errorTimes.size).toBe(500);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────

  describe('getStats()', () => {
    test('returns correct structure', () => {
      const stats = limiter.getStats();
      expect(stats).toHaveProperty('totalErrorsInWindow');
      expect(stats).toHaveProperty('uniqueErrorsInWindow');
      expect(stats).toHaveProperty('totalLimit');
      expect(stats).toHaveProperty('errorLimit');
      expect(stats).toHaveProperty('windowMs');
    });

    test('reports zero when no errors recorded', () => {
      const stats = limiter.getStats();
      expect(stats.totalErrorsInWindow).toBe(0);
      expect(stats.uniqueErrorsInWindow).toBe(0);
    });

    test('correctly counts errors within window', () => {
      limiter.shouldSendError(makeError('a'));
      limiter.shouldSendError(makeError('a'));
      limiter.shouldSendError(makeError('b'));

      const stats = limiter.getStats();
      expect(stats.totalErrorsInWindow).toBe(3);
      expect(stats.uniqueErrorsInWindow).toBe(2);
    });

    test('reflects configured limits', () => {
      const stats = limiter.getStats();
      expect(stats.totalLimit).toBe(10);
      expect(stats.errorLimit).toBe(3);
      expect(stats.windowMs).toBe(60000);
    });

    test('does not count expired errors', () => {
      limiter.shouldSendError(makeError('old'));

      jest.advanceTimersByTime(61000);

      const stats = limiter.getStats();
      expect(stats.totalErrorsInWindow).toBe(0);
      expect(stats.uniqueErrorsInWindow).toBe(0);
    });
  });

  // ─── reset ────────────────────────────────────────────────────────

  describe('reset()', () => {
    test('clears all tracking data', () => {
      limiter.shouldSendError(makeError('a'));
      limiter.shouldSendError(makeError('b'));

      limiter.reset();

      expect(limiter.totalErrors).toEqual([]);
      expect(limiter.errorTimes.size).toBe(0);
    });

    test('allows sending after reset', () => {
      const err = makeError('limited');
      for (let i = 0; i < 3; i++) {
        limiter.shouldSendError(err);
      }
      expect(limiter.shouldSendError(err).allowed).toBe(false);

      limiter.reset();

      expect(limiter.shouldSendError(err).allowed).toBe(true);
    });
  });

  // ─── Periodic Cleanup Timer ───────────────────────────────────────

  describe('periodic cleanup', () => {
    test('cleanup runs on configured interval', () => {
      const spy = jest.spyOn(limiter, '_cleanup');

      // Advance by the cleanup interval
      jest.advanceTimersByTime(300000);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
