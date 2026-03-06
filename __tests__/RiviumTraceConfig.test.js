const RiviumTraceConfig = require('../lib/config/RiviumTraceConfig');
const { SDK_VERSION } = require('../lib/config/RiviumTraceConfig');

const validOptions = () => ({
  apiKey: 'rv_live_abc123',
  serverSecret: 'rv_srv_secret456',
});

describe('RiviumTraceConfig', () => {
  // ─── Constructor & Required Fields ────────────────────────────────

  describe('constructor - required fields', () => {
    test('throws when no options are provided', () => {
      expect(() => new RiviumTraceConfig()).toThrow(
        'API key is required in RiviumTrace configuration'
      );
    });

    test('throws when apiKey is missing', () => {
      expect(() => new RiviumTraceConfig({ serverSecret: 'rv_srv_x' })).toThrow(
        'API key is required in RiviumTrace configuration'
      );
    });

    test('throws when serverSecret is missing', () => {
      expect(() => new RiviumTraceConfig({ apiKey: 'rv_live_abc' })).toThrow(
        'Server secret is required for server-side operations'
      );
    });

    test('creates config with valid apiKey and serverSecret', () => {
      const cfg = new RiviumTraceConfig(validOptions());
      expect(cfg.apiKey).toBe('rv_live_abc123');
      expect(cfg.serverSecret).toBe('rv_srv_secret456');
    });
  });

  // ─── API Key Validation ───────────────────────────────────────────

  describe('API key format validation', () => {
    test('accepts rv_live_ prefix', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), apiKey: 'rv_live_xyz' });
      expect(cfg.apiKey).toBe('rv_live_xyz');
    });

    test('accepts rv_test_ prefix', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), apiKey: 'rv_test_xyz' });
      expect(cfg.apiKey).toBe('rv_test_xyz');
    });

    test('rejects nl_live_ prefix (legacy)', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), apiKey: 'nl_live_xyz' })
      ).toThrow('API key must start with rv_live_ or rv_test_');
    });

    test('rejects nl_test_ prefix (legacy)', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), apiKey: 'nl_test_xyz' })
      ).toThrow('API key must start with rv_live_ or rv_test_');
    });

    test('rejects API key with invalid prefix', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), apiKey: 'invalid_key' })
      ).toThrow('API key must start with rv_live_ or rv_test_');
    });

    test('rejects empty string API key', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), apiKey: '' })
      ).toThrow();
    });

    test('rejects non-string API key', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), apiKey: 12345 })
      ).toThrow();
    });
  });

  // ─── Server Secret Validation ─────────────────────────────────────

  describe('server secret validation', () => {
    test('accepts rv_srv_ prefix', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), serverSecret: 'rv_srv_abc' });
      expect(cfg.serverSecret).toBe('rv_srv_abc');
    });

    test('rejects nl_srv_ prefix (legacy)', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), serverSecret: 'nl_srv_abc' })
      ).toThrow('Server secret must start with rv_srv_');
    });

    test('rejects invalid server secret prefix', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), serverSecret: 'bad_prefix' })
      ).toThrow('Server secret must start with rv_srv_');
    });

    test('rejects empty string server secret', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), serverSecret: '' })
      ).toThrow('Server secret is required for server-side operations');
    });

    test('rejects non-string server secret', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), serverSecret: 999 })
      ).toThrow();
    });
  });

  // ─── Default Values ───────────────────────────────────────────────

  describe('default values', () => {
    let cfg;
    beforeEach(() => {
      cfg = new RiviumTraceConfig(validOptions());
    });

    test('apiUrl defaults to hardcoded RiviumTrace URL', () => {
      expect(cfg.apiUrl).toBe('https://trace.rivium.co');
    });

    test('environment defaults to NODE_ENV or development', () => {
      // In jest NODE_ENV is typically "test"
      expect(['test', 'development']).toContain(cfg.environment);
    });

    test('release defaults to npm_package_version or 1.0.0', () => {
      expect(cfg.release).toBeDefined();
    });

    test('enabled defaults to true', () => {
      expect(cfg.enabled).toBe(true);
    });

    test('debug defaults to false', () => {
      expect(cfg.debug).toBe(false);
    });

    test('timeout defaults to 5000', () => {
      expect(cfg.timeout).toBe(5000);
    });

    test('captureUncaughtExceptions defaults to true', () => {
      expect(cfg.captureUncaughtExceptions).toBe(true);
    });

    test('captureUnhandledRejections defaults to true', () => {
      expect(cfg.captureUnhandledRejections).toBe(true);
    });

    test('maxBreadcrumbs defaults to 50', () => {
      expect(cfg.maxBreadcrumbs).toBe(50);
    });

    test('beforeSend defaults to null', () => {
      expect(cfg.beforeSend).toBeNull();
    });
  });

  // ─── Custom Values ────────────────────────────────────────────────

  describe('custom option values', () => {
    test('allows custom environment', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), environment: 'staging' });
      expect(cfg.environment).toBe('staging');
    });

    test('allows custom release', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), release: '2.5.0' });
      expect(cfg.release).toBe('2.5.0');
    });

    test('allows enabled = false', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), enabled: false });
      expect(cfg.enabled).toBe(false);
    });

    test('allows debug = true', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), debug: true });
      expect(cfg.debug).toBe(true);
    });

    test('allows custom timeout within range', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), timeout: 10000 });
      expect(cfg.timeout).toBe(10000);
    });

    test('allows maxBreadcrumbs within range', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), maxBreadcrumbs: 25 });
      expect(cfg.maxBreadcrumbs).toBe(25);
    });

    test('allows beforeSend callback', () => {
      const cb = jest.fn();
      const cfg = new RiviumTraceConfig({ ...validOptions(), beforeSend: cb });
      expect(cfg.beforeSend).toBe(cb);
    });

    test('captureUncaughtExceptions can be disabled', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), captureUncaughtExceptions: false });
      expect(cfg.captureUncaughtExceptions).toBe(false);
    });

    test('captureUnhandledRejections can be disabled', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), captureUnhandledRejections: false });
      expect(cfg.captureUnhandledRejections).toBe(false);
    });
  });

  // ─── Timeout Validation ───────────────────────────────────────────

  describe('timeout validation', () => {
    test('rejects timeout below 1000ms', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), timeout: 500 })
      ).toThrow('Timeout must be between 1000ms and 30000ms');
    });

    test('rejects timeout above 30000ms', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), timeout: 60000 })
      ).toThrow('Timeout must be between 1000ms and 30000ms');
    });

    test('accepts timeout at lower boundary (1000ms)', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), timeout: 1000 });
      expect(cfg.timeout).toBe(1000);
    });

    test('accepts timeout at upper boundary (30000ms)', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), timeout: 30000 });
      expect(cfg.timeout).toBe(30000);
    });
  });

  // ─── maxBreadcrumbs Validation ────────────────────────────────────

  describe('maxBreadcrumbs validation', () => {
    test('rejects negative maxBreadcrumbs', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), maxBreadcrumbs: -1 })
      ).toThrow('maxBreadcrumbs must be between 0 and 100');
    });

    test('rejects maxBreadcrumbs above 100', () => {
      expect(
        () => new RiviumTraceConfig({ ...validOptions(), maxBreadcrumbs: 200 })
      ).toThrow('maxBreadcrumbs must be between 0 and 100');
    });

    test('maxBreadcrumbs of 0 defaults to 50 (falsy value)', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), maxBreadcrumbs: 0 });
      expect(cfg.maxBreadcrumbs).toBe(50);
    });

    test('accepts maxBreadcrumbs at upper boundary (100)', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), maxBreadcrumbs: 100 });
      expect(cfg.maxBreadcrumbs).toBe(100);
    });
  });

  // ─── Instance Methods ─────────────────────────────────────────────

  describe('getEndpoint()', () => {
    test('returns correct API errors endpoint', () => {
      const cfg = new RiviumTraceConfig(validOptions());
      expect(cfg.getEndpoint()).toBe('https://trace.rivium.co/api/errors');
    });
  });

  describe('isEnabled()', () => {
    test('returns true when enabled', () => {
      const cfg = new RiviumTraceConfig(validOptions());
      expect(cfg.isEnabled()).toBe(true);
    });

    test('returns false when disabled', () => {
      const cfg = new RiviumTraceConfig({ ...validOptions(), enabled: false });
      expect(cfg.isEnabled()).toBe(false);
    });
  });

  describe('shouldCaptureException()', () => {
    test('returns true for any error', () => {
      const cfg = new RiviumTraceConfig(validOptions());
      expect(cfg.shouldCaptureException(new Error('test'))).toBe(true);
    });
  });

  // ─── SDK_VERSION Export ───────────────────────────────────────────

  describe('SDK_VERSION export', () => {
    test('SDK_VERSION is exported and is a string', () => {
      expect(typeof SDK_VERSION).toBe('string');
    });

    test('SDK_VERSION matches expected format', () => {
      expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
