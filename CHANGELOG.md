# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
