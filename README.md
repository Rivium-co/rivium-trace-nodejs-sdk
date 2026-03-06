# RiviumTrace Node.js SDK

Server-side error tracking, logging, and performance monitoring for Node.js applications.

## Installation

```bash
npm install @rivium-trace/nodejs-sdk
```

## Quick Start

```javascript
const RiviumTrace = require('@rivium-trace/nodejs-sdk');

// Initialize RiviumTrace
RiviumTrace.init({
  apiKey: 'rv_live_your_api_key_here',
  serverSecret: 'rv_srv_your_server_secret_here',
  environment: 'production',
  release: '1.0.0'
});

// Capture exceptions
try {
  throw new Error('Something went wrong!');
} catch (error) {
  RiviumTrace.captureException(error);
}

// Capture messages
RiviumTrace.captureMessage('User completed checkout');
```

## Configuration Options

```javascript
RiviumTrace.init({
  // Required - Get from Rivium Console
  apiKey: 'rv_live_your_api_key',              // format: rv_live_xxx or rv_test_xxx
  serverSecret: 'rv_srv_your_server_secret',   // format: rv_srv_xxx

  // Optional
  environment: 'production',               // Environment name
  release: '1.0.0',                        // App version
  enabled: true,                           // Enable/disable tracking
  debug: false,                            // Enable debug logging
  timeout: 5000,                           // HTTP timeout (ms)
  captureUncaughtExceptions: true,         // Auto-capture uncaught exceptions
  captureUnhandledRejections: true,        // Auto-capture unhandled rejections
  maxBreadcrumbs: 50,                      // Max breadcrumbs to keep (0-100)
  sampleRate: 1.0,                         // Sample rate (0.0 - 1.0)

  // Filter/modify errors before sending
  beforeSend(error) {
    if (error.message.includes('ignore-this')) {
      return null; // Don't send
    }
    return error;
  }
});
```

## Error Tracking

### Capturing Errors

```javascript
// Capture an exception
RiviumTrace.captureException(error, {
  extra: {
    userId: 123,
    feature: 'checkout'
  }
});

// Capture a message
RiviumTrace.captureMessage('Something happened', {
  extra: { context: 'additional info' }
});
```

### Breadcrumbs

Breadcrumbs track events leading up to an error:

```javascript
// Manual breadcrumb
RiviumTrace.addBreadcrumb({
  message: 'User clicked checkout',
  category: 'user-action',
  level: 'info',
  data: { cartTotal: 99.99 }
});

// Using Breadcrumb helpers
const { Breadcrumb } = require('@rivium-trace/nodejs-sdk');

RiviumTrace.addBreadcrumb(Breadcrumb.http('POST', '/api/order', 200, 150));
RiviumTrace.addBreadcrumb(Breadcrumb.database('SELECT * FROM users', 25));
RiviumTrace.addBreadcrumb(Breadcrumb.user('clicked_button', { buttonId: 'submit' }));
RiviumTrace.addBreadcrumb(Breadcrumb.console('warn', 'Deprecated method called'));
RiviumTrace.addBreadcrumb(Breadcrumb.navigation('/dashboard', '/settings', 'GET'));
RiviumTrace.addBreadcrumb(Breadcrumb.custom('Cache cleared', 'cache', { keys: 15 }));
```

### User Context

```javascript
RiviumTrace.setUser({
  id: 123,
  email: 'user@example.com',
  username: 'john_doe'
});
```

### Scoped Context

```javascript
RiviumTrace.withScope((scope) => {
  scope.setUser({ id: 456 });
  scope.setExtra('operation', 'bulk_import');
  scope.addBreadcrumb({ message: 'Starting import' });

  // Errors captured here include this context
  RiviumTrace.captureException(new Error('Import failed'));
});
// Context is restored after the block
```

## Logging

```javascript
// Enable logging with a source identifier
RiviumTrace.enableLogging({
  sourceId: 'my-app-backend',
  sourceName: 'My App Backend',
  batchSize: 50,
  flushIntervalMs: 5000
});

// Log at different levels
RiviumTrace.info('Server started on port 3000');
RiviumTrace.warn('Slow query detected', { duration_ms: 2500 });
RiviumTrace.logError('Payment gateway timeout', { orderId: 'ORD-123' });
RiviumTrace.logDebug('Cache miss for key: user_123');
RiviumTrace.trace('Entering processOrder()');
RiviumTrace.fatal('Database connection lost');

// Or use the generic log method
RiviumTrace.log('Custom message', 'info', { key: 'value' });

// Flush logs manually
await RiviumTrace.flushLogs();

// Check pending log count
console.log(RiviumTrace.pendingLogCount);
```

## Performance Monitoring

```javascript
const { PerformanceSpan } = require('@rivium-trace/nodejs-sdk');

// Track an async operation with automatic timing
const result = await RiviumTrace.trackOperation('fetch-users', async () => {
  return await db.query('SELECT * FROM users');
}, {
  operationType: 'db.query',
  tags: { table: 'users' }
});

// Or manually create spans
const span = new PerformanceSpan({
  operation: 'api.request',
  operationType: 'http',
  tags: { method: 'GET', url: '/api/users' }
});

span.start();
// ... do work ...
span.finish();

RiviumTrace.reportPerformanceSpan(span);

// Flush performance data
await RiviumTrace.flushPerformance();
```

## Express.js Integration

```javascript
const express = require('express');
const RiviumTrace = require('@rivium-trace/nodejs-sdk');

const app = express();

// Initialize
RiviumTrace.init({
  apiKey: 'rv_live_your_api_key',
  serverSecret: 'rv_srv_your_server_secret',
  environment: process.env.NODE_ENV
});

// Add middleware
const middleware = RiviumTrace.expressMiddleware();
app.use(middleware.requestHandler());

// Your routes
app.get('/api/users/:id', async (req, res) => {
  // Your route logic
});

// Error handler (must be last)
app.use(middleware.errorHandler());

app.listen(3000);
```

## Advanced Usage

### Custom Error Filtering

```javascript
RiviumTrace.init({
  apiKey: 'rv_live_your_api_key',
  serverSecret: 'rv_srv_your_server_secret',
  beforeSend(error) {
    // Don't send network errors
    if (error.message.includes('ECONNREFUSED')) {
      return null;
    }

    // Add custom data
    error.setExtra('server_id', process.env.SERVER_ID);

    return error;
  }
});
```

### Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await RiviumTrace.flush(2000); // Wait up to 2s for pending errors
  await RiviumTrace.close();
  process.exit(0);
});
```

### Get SDK Stats

```javascript
const stats = RiviumTrace.getStats();
console.log(stats);
// {
//   isEnabled: true,
//   breadcrumbCount: 5,
//   rateLimiter: { totalErrors: 3, windowStart: 1699123456789 },
//   config: { environment: 'production', release: '1.0.0', apiKey: 'rv_live_...' }
// }
```

## TypeScript Support

This package includes TypeScript definitions. Import types as needed:

```typescript
import RiviumTrace, {
  RiviumTraceInitOptions,
  RiviumTraceError,
  Breadcrumb,
  BreadcrumbOptions,
  UserContext
} from '@rivium-trace/nodejs-sdk';
```

## Source Maps

If you're using TypeScript, bundlers (webpack, esbuild), or Babel, enable source maps for accurate stack traces:

```bash
node --enable-source-maps app.js
```

Or programmatically in your app:

```javascript
process.setSourceMapsEnabled(true);
```

## Requirements

- Node.js >= 12.0.0
- Express >= 4.0.0 (optional, for Express middleware)

## License

MIT
