# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-10-05

### Fixed
- Express: the request address sent with errors and breadcrumbs no longer contains the values of sensitive query parameters (tokens, passwords, codes); they are replaced with `[REDACTED]`.
- TypeScript: `expressMiddleware()` is typed with `requestHandler()` and `errorHandler()`.
- `expressMiddleware()` returns the same shape before `init()` as after it.

## [0.2.2] - 2026-10-05

### Fixed
- `flush()` now sends what is still waiting (errors, messages, logs, performance spans) and reports whether it finished in time. Before, it only waited.

### Changed
- Minimum Node.js version is declared as 14, which the SDK already needed.

## [0.2.1] - 2026-09-28

### Changed
- Express errors no longer include request headers or body; sensitive query and route values are redacted.

### Added
- Express errors include the matched route and path; every event includes the SDK version.

### Fixed
- `captureMessage()` now sends messages instead of creating issues, and accepts `level` and `tags`.
- Express errors report the real response status instead of 200.

## [0.2.0] - 2026-09-25

### Added
- `ignoredExceptions`: exceptions that are never reported, given as a
  constructor, an error name, or a regular expression.
- `ignoredPaths`: request paths the Express middleware skips — health checks,
  metrics endpoints — given as a glob, an exact path, or a regular expression.

### Fixed
- TypeScript definitions no longer require `@types/express`, which is only
  needed if you use the middleware.
- `addBreadcrumb(Breadcrumb.http(...))` now type-checks, and `Breadcrumb.http`
  correctly marks its status code and duration as optional.

## [0.1.5] - 2026-08-15

### Added
- SDK identity (`name`, `version`, `platform`) now travels in the request body as `client` on every ingest call (errors, performance batch, logs). Enables filtering by SDK in the Trace dashboard.

## [0.1.4] - 2026-06-12

### Fixed
- **Express middleware crashed every request.** `ExpressMiddleware` was calling
  `this.riviumTrace.captureException(...)`, `setRequestContext(...)`,
  `addBreadcrumb(...)`, and `setUser(...)` on the stored instance — but those
  methods are declared as **static** on the `RiviumTrace` class, so the calls
  threw `xxx is not a function`. In hosts whose error handler ran after the
  SDK's `errorHandler()`, this turned every error into a 500. The middleware
  now resolves the `RiviumTrace` class via lazy `require` and calls the static
  API directly. Telemetry calls are also wrapped in try/catch so internal SDK
  failures can never bubble into a request.
- Added regression test suite `__tests__/ExpressMiddleware.test.js` covering
  `requestHandler`, `errorHandler`, `userMiddleware`, `transactionMiddleware`,
  and the "telemetry must never crash the request" guarantee.

## [0.1.0] - 2025-12-12

### Added
- Initial release of RiviumTrace Node.js SDK
- Automatic capture of uncaught exceptions
- Automatic capture of unhandled promise rejections
- Manual error capture with `captureException()`
- Manual message capture with `captureMessage()`
- Breadcrumb support for tracking user actions and events
- Express.js middleware for automatic error handling
- User context tracking
- Request context tracking
- Rate limiting to prevent flooding
- `beforeSend` callback for filtering/modifying errors
- `withScope` for isolated error contexts
- TypeScript type definitions
- Debug mode for development
