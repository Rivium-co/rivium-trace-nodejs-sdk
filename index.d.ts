// Type definitions for @rivium-trace/nodejs-sdk
// Project: https://rivium.co
// Definitions by: RiviumTrace Team <support@rivium.co>

import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RiviumTraceInitOptions {
  /** Your RiviumTrace API key from Console (required) - format: rv_live_xxx or rv_test_xxx */
  apiKey: string;
  /** Server secret for server-side authentication (required) - format: rv_srv_xxx */
  serverSecret: string;
  /** Environment name (default: NODE_ENV or 'development') */
  environment?: string;
  /** Release version (default: npm_package_version or '1.0.0') */
  release?: string;
  /** Enable/disable error tracking (default: true) */
  enabled?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** HTTP request timeout in ms (default: 5000) */
  timeout?: number;
  /** Capture uncaught exceptions (default: true) */
  captureUncaughtExceptions?: boolean;
  /** Capture unhandled promise rejections (default: true) */
  captureUnhandledRejections?: boolean;
  /** Maximum breadcrumbs to keep (default: 50, max: 100) */
  maxBreadcrumbs?: number;
  /** Callback to modify or filter errors before sending */
  beforeSend?: (error: RiviumTraceError) => RiviumTraceError | null;
  /** Sample rate for error/message capture (0.0 to 1.0, default: 1.0) */
  sampleRate?: number;
}

export interface BreadcrumbOptions {
  /** Breadcrumb message */
  message?: string;
  /** Category (e.g., 'http', 'database', 'console', 'navigation', 'user') */
  category?: string;
  /** Severity level */
  level?: 'info' | 'warning' | 'error';
  /** Additional data */
  data?: Record<string, unknown>;
  /** Timestamp (default: now) */
  timestamp?: string;
}

export interface UserContext {
  id?: string | number;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface RequestContext {
  [key: string]: unknown;
}

export interface CaptureOptions {
  extra?: Record<string, unknown>;
}

export interface Scope {
  setExtra(key: string, value: unknown): void;
  setUser(user: UserContext): void;
  addBreadcrumb(breadcrumb: BreadcrumbOptions): void;
}

export interface Stats {
  isEnabled: boolean;
  breadcrumbCount: number;
  rateLimiter: {
    totalErrors: number;
    windowStart: number;
  };
  config: {
    environment: string;
    release: string;
    apiKey: string;
  };
}

export class RiviumTraceError {
  message: string;
  stack_trace: string;
  platform: string;
  environment: string;
  release: string;
  timestamp: string;
  extra: Record<string, unknown>;
  user_agent: string;
  url: string;

  constructor(options?: Partial<RiviumTraceError>);

  toJSON(): Record<string, unknown>;
  setExtra(key: string, value: unknown): this;
  setExtras(extras: Record<string, unknown>): this;
  setRequestContext(req: Request): this;
  addNodeContext(): this;

  static fromError(error: Error, options?: CaptureOptions & { environment?: string; release?: string; url?: string }): RiviumTraceError;
  static fromMessage(message: string, options?: CaptureOptions & { environment?: string; release?: string; url?: string }): RiviumTraceError;
}

export class RiviumTraceConfig {
  apiKey: string;
  serverSecret: string;
  environment: string;
  release: string;
  enabled: boolean;
  debug: boolean;
  timeout: number;
  captureUncaughtExceptions: boolean;
  captureUnhandledRejections: boolean;
  maxBreadcrumbs: number;
  beforeSend: ((error: RiviumTraceError) => RiviumTraceError | null) | null;

  constructor(options: RiviumTraceInitOptions);

  getEndpoint(): string;
  isEnabled(): boolean;
  shouldCaptureException(error: Error): boolean;
}

export class Breadcrumb {
  timestamp: string;
  message: string;
  category: string;
  level: string;
  data: Record<string, unknown>;

  constructor(options?: BreadcrumbOptions);

  toJSON(): BreadcrumbOptions;

  static http(method: string, url: string, statusCode: number, duration: number): Breadcrumb;
  static database(query: string, duration: number, error?: Error | null): Breadcrumb;
  static console(level: string, message: string, ...args: unknown[]): Breadcrumb;
  static navigation(from: string, to: string, method?: string): Breadcrumb;
  static user(action: string, data?: Record<string, unknown>): Breadcrumb;
  static custom(message: string, category: string, data?: Record<string, unknown>): Breadcrumb;
}

export class BreadcrumbManager {
  breadcrumbs: Breadcrumb[];
  maxBreadcrumbs: number;

  constructor(maxBreadcrumbs?: number);

  add(breadcrumb: Breadcrumb | BreadcrumbOptions): void;
  clear(): void;
  getAll(): Breadcrumb[];
  getRecent(count?: number): Breadcrumb[];
  toJSON(): BreadcrumbOptions[];
}

// Logging types
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  message: string;
  level: LogLevel;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface LogServiceConfig {
  apiKey: string;
  sourceId?: string;
  sourceName?: string;
  platform?: string;
  environment?: string;
  release?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  debug?: boolean;
}

export interface EnableLoggingOptions {
  sourceId?: string;
  sourceName?: string;
  batchSize?: number;
  flushIntervalMs?: number;
}

// Performance types
export interface PerformanceSpanData {
  operation: string;
  operationType: 'http' | 'db' | 'custom';
  httpMethod?: string;
  httpUrl?: string;
  httpStatusCode?: number;
  httpHost?: string;
  durationMs: number;
  startTime: string;
  endTime?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  platform: string;
  environment?: string;
  releaseVersion?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  status: 'ok' | 'error';
  errorMessage?: string;
}

export class PerformanceSpan {
  operation: string;
  operationType: 'http' | 'db' | 'custom';
  httpMethod?: string;
  httpUrl?: string;
  httpStatusCode?: number;
  httpHost?: string;
  durationMs: number;
  startTime: string;
  endTime?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  platform: string;
  environment?: string;
  releaseVersion?: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  status: 'ok' | 'error';
  errorMessage?: string;

  constructor(options: Partial<PerformanceSpanData>);

  toJSON(): PerformanceSpanData;

  static fromHttpRequest(options: {
    method: string;
    url: string;
    statusCode?: number;
    durationMs: number;
    startTime: Date;
    environment?: string;
    releaseVersion?: string;
    errorMessage?: string;
    tags?: Record<string, string>;
  }): PerformanceSpan;

  static forDbQuery(options: {
    queryType: string;
    tableName: string;
    durationMs: number;
    startTime: Date;
    rowsAffected?: number;
    environment?: string;
    releaseVersion?: string;
    errorMessage?: string;
    tags?: Record<string, string>;
  }): PerformanceSpan;

  static custom(options: {
    operation: string;
    durationMs: number;
    startTime: Date;
    operationType?: 'http' | 'db' | 'custom';
    status?: 'ok' | 'error';
    environment?: string;
    releaseVersion?: string;
    errorMessage?: string;
    tags?: Record<string, string>;
  }): PerformanceSpan;
}

export class PerformanceClient {
  constructor(config: RiviumTraceConfig, options?: {
    batchSize?: number;
    flushIntervalMs?: number;
  });

  reportSpan(span: PerformanceSpan): void;
  trackOperation<T>(operation: string, fn: () => Promise<T>, options?: {
    operationType?: 'http' | 'db' | 'custom';
    tags?: Record<string, string>;
  }): Promise<T>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export function generateTraceId(): string;
export function generateSpanId(): string;

export class LogService {
  constructor(config: LogServiceConfig);

  add(entry: LogEntry): void;
  log(message: string, level?: LogLevel, metadata?: Record<string, unknown>, userId?: string): void;
  sendImmediate(entry: LogEntry): Promise<boolean>;
  flush(): Promise<boolean>;
  dispose(): Promise<boolean>;
  readonly bufferSize: number;
}

declare class RiviumTrace {
  /** Initialize RiviumTrace with configuration */
  static init(options: RiviumTraceInitOptions): RiviumTrace;

  /** Capture an exception */
  static captureException(error: Error, options?: CaptureOptions): Promise<void>;

  /** Capture a message */
  static captureMessage(message: string, options?: CaptureOptions): Promise<void>;

  /** Add a breadcrumb */
  static addBreadcrumb(breadcrumb: BreadcrumbOptions): void;

  /** Set request context */
  static setRequestContext(context: RequestContext): void;

  /** Set user context */
  static setUser(user: UserContext): void;

  /** Express error handling middleware */
  static expressMiddleware(): RequestHandler;

  /** Get current configuration */
  static getConfig(): RiviumTraceConfig | null;

  /** Check if RiviumTrace is enabled */
  static isEnabled(): boolean;

  /** Execute callback with isolated scope */
  static withScope<T>(callback: (scope: Scope) => T): T;

  /** Get current stats */
  static getStats(): Stats | null;

  /** Flush pending errors before shutdown */
  static flush(timeout?: number): Promise<boolean>;

  /** Close and cleanup RiviumTrace */
  static close(): Promise<void>;

  // ==================== PERFORMANCE ====================

  /** Report a single performance span */
  static reportPerformanceSpan(span: PerformanceSpan): void;

  /** Report multiple performance spans in a batch */
  static reportPerformanceSpanBatch(spans: PerformanceSpan[]): void;

  /** Track an async operation with automatic timing */
  static trackOperation<T>(operation: string, fn: () => Promise<T>, options?: {
    operationType?: 'http' | 'db' | 'custom';
    tags?: Record<string, string>;
  }): Promise<T>;

  /** Flush pending performance spans */
  static flushPerformance(): Promise<void>;

  // ==================== LOGGING ====================

  /** Enable logging with optional configuration */
  static enableLogging(options?: EnableLoggingOptions): void;

  /** Log a message with the specified level */
  static log(message: string, level?: LogLevel, metadata?: Record<string, unknown>): void;

  /** Log a trace-level message */
  static trace(message: string, metadata?: Record<string, unknown>): void;

  /** Log a debug-level message */
  static logDebug(message: string, metadata?: Record<string, unknown>): void;

  /** Log an info-level message */
  static info(message: string, metadata?: Record<string, unknown>): void;

  /** Log a warning-level message */
  static warn(message: string, metadata?: Record<string, unknown>): void;

  /** Log an error-level message (for non-exception errors) */
  static logError(message: string, metadata?: Record<string, unknown>): void;

  /** Log a fatal-level message */
  static fatal(message: string, metadata?: Record<string, unknown>): void;

  /** Flush all pending logs immediately */
  static flushLogs(): Promise<boolean>;

  /** Get the number of logs currently buffered */
  static readonly pendingLogCount: number;
}

export default RiviumTrace;
export = RiviumTrace;
