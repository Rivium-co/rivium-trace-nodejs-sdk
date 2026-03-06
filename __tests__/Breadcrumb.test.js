const { Breadcrumb, BreadcrumbManager } = require('../lib/models/Breadcrumb');

describe('Breadcrumb', () => {
  // ─── Constructor Defaults ─────────────────────────────────────────

  describe('constructor defaults', () => {
    test('sets timestamp to an ISO string', () => {
      const bc = new Breadcrumb();
      expect(() => new Date(bc.timestamp)).not.toThrow();
    });

    test('sets default message to empty string', () => {
      const bc = new Breadcrumb();
      expect(bc.message).toBe('');
    });

    test('sets default category to "manual"', () => {
      const bc = new Breadcrumb();
      expect(bc.category).toBe('manual');
    });

    test('sets default level to "info"', () => {
      const bc = new Breadcrumb();
      expect(bc.level).toBe('info');
    });

    test('sets default data to empty object', () => {
      const bc = new Breadcrumb();
      expect(bc.data).toEqual({});
    });
  });

  // ─── Constructor with Options ─────────────────────────────────────

  describe('constructor with options', () => {
    test('accepts all custom options', () => {
      const opts = {
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'custom',
        category: 'test',
        level: 'error',
        data: { key: 'val' },
      };
      const bc = new Breadcrumb(opts);
      expect(bc.timestamp).toBe(opts.timestamp);
      expect(bc.message).toBe('custom');
      expect(bc.category).toBe('test');
      expect(bc.level).toBe('error');
      expect(bc.data).toEqual({ key: 'val' });
    });
  });

  // ─── Breadcrumb.http() ────────────────────────────────────────────

  describe('Breadcrumb.http()', () => {
    test('creates HTTP breadcrumb with correct message', () => {
      const bc = Breadcrumb.http('GET', '/api/users', 200, 150);
      expect(bc.message).toBe('GET /api/users');
    });

    test('sets category to "http"', () => {
      const bc = Breadcrumb.http('POST', '/api', 201, 100);
      expect(bc.category).toBe('http');
    });

    test('sets level to "info" for success status codes', () => {
      const bc = Breadcrumb.http('GET', '/', 200, 50);
      expect(bc.level).toBe('info');
    });

    test('sets level to "error" for 4xx status codes', () => {
      const bc = Breadcrumb.http('GET', '/', 404, 50);
      expect(bc.level).toBe('error');
    });

    test('sets level to "error" for 5xx status codes', () => {
      const bc = Breadcrumb.http('GET', '/', 500, 50);
      expect(bc.level).toBe('error');
    });

    test('sets level to "info" for 399 status code', () => {
      const bc = Breadcrumb.http('GET', '/', 399, 50);
      expect(bc.level).toBe('info');
    });

    test('includes method, url, status_code, duration_ms in data', () => {
      const bc = Breadcrumb.http('DELETE', '/api/item', 204, 75);
      expect(bc.data).toEqual({
        method: 'DELETE',
        url: '/api/item',
        status_code: 204,
        duration_ms: 75,
      });
    });
  });

  // ─── Breadcrumb.database() ────────────────────────────────────────

  describe('Breadcrumb.database()', () => {
    test('creates database breadcrumb with truncated query in message', () => {
      const bc = Breadcrumb.database('SELECT * FROM users', 25);
      expect(bc.message).toBe('Database query: SELECT * FROM users');
      expect(bc.category).toBe('database');
    });

    test('truncates long queries in message at 100 chars with ellipsis', () => {
      const longQuery = 'A'.repeat(150);
      const bc = Breadcrumb.database(longQuery, 10);
      expect(bc.message).toBe(`Database query: ${'A'.repeat(100)}...`);
    });

    test('truncates query in data at 500 chars', () => {
      const longQuery = 'B'.repeat(600);
      const bc = Breadcrumb.database(longQuery, 10);
      expect(bc.data.query).toBe('B'.repeat(500));
    });

    test('sets level to "info" when no error', () => {
      const bc = Breadcrumb.database('SELECT 1', 5);
      expect(bc.level).toBe('info');
    });

    test('sets level to "error" when error is provided', () => {
      const bc = Breadcrumb.database('SELECT 1', 5, new Error('connection lost'));
      expect(bc.level).toBe('error');
    });

    test('includes error message in data when error is provided', () => {
      const bc = Breadcrumb.database('SELECT 1', 5, new Error('timeout'));
      expect(bc.data.error).toBe('timeout');
    });

    test('error in data is undefined when no error', () => {
      const bc = Breadcrumb.database('SELECT 1', 5);
      expect(bc.data.error).toBeUndefined();
    });
  });

  // ─── Breadcrumb.console() ─────────────────────────────────────────

  describe('Breadcrumb.console()', () => {
    test('creates console breadcrumb with formatted message', () => {
      const bc = Breadcrumb.console('log', 'hello world');
      expect(bc.message).toBe('Console.log: hello world');
      expect(bc.category).toBe('console');
    });

    test('sets level to "error" for console.error', () => {
      const bc = Breadcrumb.console('error', 'something broke');
      expect(bc.level).toBe('error');
    });

    test('sets level to "warning" for console.warn', () => {
      const bc = Breadcrumb.console('warn', 'deprecated');
      expect(bc.level).toBe('warning');
    });

    test('sets level to "info" for console.log', () => {
      const bc = Breadcrumb.console('log', 'info msg');
      expect(bc.level).toBe('info');
    });

    test('sets level to "info" for console.info', () => {
      const bc = Breadcrumb.console('info', 'informational');
      expect(bc.level).toBe('info');
    });

    test('captures additional arguments', () => {
      const bc = Breadcrumb.console('log', 'msg', 'arg1', 'arg2');
      expect(bc.data.arguments).toEqual(['arg1', 'arg2']);
    });

    test('arguments is undefined when no extra args', () => {
      const bc = Breadcrumb.console('log', 'msg');
      expect(bc.data.arguments).toBeUndefined();
    });
  });

  // ─── Breadcrumb.navigation() ──────────────────────────────────────

  describe('Breadcrumb.navigation()', () => {
    test('creates navigation breadcrumb with correct message', () => {
      const bc = Breadcrumb.navigation('/home', '/about');
      expect(bc.message).toBe('GET /about');
      expect(bc.category).toBe('navigation');
      expect(bc.level).toBe('info');
    });

    test('includes from, to, and method in data', () => {
      const bc = Breadcrumb.navigation('/a', '/b', 'POST');
      expect(bc.data).toEqual({ from: '/a', to: '/b', method: 'POST' });
    });

    test('defaults method to GET', () => {
      const bc = Breadcrumb.navigation('/x', '/y');
      expect(bc.data.method).toBe('GET');
    });
  });

  // ─── Breadcrumb.user() ────────────────────────────────────────────

  describe('Breadcrumb.user()', () => {
    test('creates user action breadcrumb', () => {
      const bc = Breadcrumb.user('login');
      expect(bc.message).toBe('User action: login');
      expect(bc.category).toBe('user');
      expect(bc.level).toBe('info');
    });

    test('includes custom data', () => {
      const bc = Breadcrumb.user('click', { button: 'submit' });
      expect(bc.data).toEqual({ button: 'submit' });
    });

    test('defaults data to empty object', () => {
      const bc = Breadcrumb.user('hover');
      expect(bc.data).toEqual({});
    });
  });

  // ─── Breadcrumb.custom() ──────────────────────────────────────────

  describe('Breadcrumb.custom()', () => {
    test('creates custom breadcrumb with message and category', () => {
      const bc = Breadcrumb.custom('custom msg', 'my-category');
      expect(bc.message).toBe('custom msg');
      expect(bc.category).toBe('my-category');
      expect(bc.level).toBe('info');
    });

    test('includes data', () => {
      const bc = Breadcrumb.custom('msg', 'cat', { x: 1 });
      expect(bc.data).toEqual({ x: 1 });
    });

    test('defaults data to empty object', () => {
      const bc = Breadcrumb.custom('msg', 'cat');
      expect(bc.data).toEqual({});
    });
  });

  // ─── toJSON ───────────────────────────────────────────────────────

  describe('toJSON()', () => {
    test('returns all properties', () => {
      const bc = new Breadcrumb({
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'test',
        category: 'custom',
        level: 'warning',
        data: { key: 'value' },
      });
      const json = bc.toJSON();
      expect(json).toEqual({
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'test',
        category: 'custom',
        level: 'warning',
        data: { key: 'value' },
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════

describe('BreadcrumbManager', () => {
  // ─── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    test('initializes with empty breadcrumbs array', () => {
      const mgr = new BreadcrumbManager();
      expect(mgr.getAll()).toEqual([]);
    });

    test('defaults maxBreadcrumbs to 50', () => {
      const mgr = new BreadcrumbManager();
      expect(mgr.maxBreadcrumbs).toBe(50);
    });

    test('accepts custom maxBreadcrumbs', () => {
      const mgr = new BreadcrumbManager(10);
      expect(mgr.maxBreadcrumbs).toBe(10);
    });
  });

  // ─── add() ────────────────────────────────────────────────────────

  describe('add()', () => {
    test('adds a Breadcrumb instance', () => {
      const mgr = new BreadcrumbManager();
      const bc = new Breadcrumb({ message: 'test' });
      mgr.add(bc);
      expect(mgr.getAll()).toHaveLength(1);
      expect(mgr.getAll()[0].message).toBe('test');
    });

    test('wraps plain object in Breadcrumb instance', () => {
      const mgr = new BreadcrumbManager();
      mgr.add({ message: 'plain', category: 'test' });
      expect(mgr.getAll()).toHaveLength(1);
      expect(mgr.getAll()[0]).toBeInstanceOf(Breadcrumb);
      expect(mgr.getAll()[0].message).toBe('plain');
    });

    test('trims oldest breadcrumb when exceeding max (FIFO)', () => {
      const mgr = new BreadcrumbManager(3);
      mgr.add(new Breadcrumb({ message: 'first' }));
      mgr.add(new Breadcrumb({ message: 'second' }));
      mgr.add(new Breadcrumb({ message: 'third' }));
      mgr.add(new Breadcrumb({ message: 'fourth' }));

      const all = mgr.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].message).toBe('second');
      expect(all[2].message).toBe('fourth');
    });

    test('maintains max size after many additions', () => {
      const mgr = new BreadcrumbManager(5);
      for (let i = 0; i < 20; i++) {
        mgr.add(new Breadcrumb({ message: `msg-${i}` }));
      }
      expect(mgr.getAll()).toHaveLength(5);
      expect(mgr.getAll()[0].message).toBe('msg-15');
      expect(mgr.getAll()[4].message).toBe('msg-19');
    });
  });

  // ─── clear() ──────────────────────────────────────────────────────

  describe('clear()', () => {
    test('removes all breadcrumbs', () => {
      const mgr = new BreadcrumbManager();
      mgr.add(new Breadcrumb({ message: 'a' }));
      mgr.add(new Breadcrumb({ message: 'b' }));
      mgr.clear();
      expect(mgr.getAll()).toEqual([]);
    });
  });

  // ─── getAll() ─────────────────────────────────────────────────────

  describe('getAll()', () => {
    test('returns a copy, not a reference', () => {
      const mgr = new BreadcrumbManager();
      mgr.add(new Breadcrumb({ message: 'a' }));
      const all = mgr.getAll();
      all.push(new Breadcrumb({ message: 'pushed' }));
      expect(mgr.getAll()).toHaveLength(1);
    });
  });

  // ─── getRecent() ──────────────────────────────────────────────────

  describe('getRecent()', () => {
    test('returns last N breadcrumbs', () => {
      const mgr = new BreadcrumbManager();
      for (let i = 0; i < 10; i++) {
        mgr.add(new Breadcrumb({ message: `msg-${i}` }));
      }
      const recent = mgr.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].message).toBe('msg-7');
      expect(recent[2].message).toBe('msg-9');
    });

    test('defaults to last 10', () => {
      const mgr = new BreadcrumbManager();
      for (let i = 0; i < 20; i++) {
        mgr.add(new Breadcrumb({ message: `msg-${i}` }));
      }
      const recent = mgr.getRecent();
      expect(recent).toHaveLength(10);
    });

    test('returns all when fewer than requested', () => {
      const mgr = new BreadcrumbManager();
      mgr.add(new Breadcrumb({ message: 'only' }));
      const recent = mgr.getRecent(5);
      expect(recent).toHaveLength(1);
    });
  });

  // ─── toJSON() ─────────────────────────────────────────────────────

  describe('toJSON()', () => {
    test('returns array of JSON representations', () => {
      const mgr = new BreadcrumbManager();
      mgr.add(new Breadcrumb({ message: 'a', category: 'test' }));
      mgr.add(new Breadcrumb({ message: 'b', category: 'test' }));

      const json = mgr.toJSON();
      expect(json).toHaveLength(2);
      expect(json[0]).toHaveProperty('message', 'a');
      expect(json[0]).toHaveProperty('timestamp');
      expect(json[1]).toHaveProperty('message', 'b');
    });

    test('returns empty array when no breadcrumbs', () => {
      const mgr = new BreadcrumbManager();
      expect(mgr.toJSON()).toEqual([]);
    });
  });
});
