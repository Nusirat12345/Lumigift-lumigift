/**
 * Next.js Instrumentation hook.
 *
 * Runs once on server startup (Node.js runtime) before any route handlers are
 * invoked.  Responsibilities:
 *   1. Validate required environment variables (fast-fail on misconfiguration)
 *   2. Initialise OpenTelemetry SDK so traces cover the full request lifecycle
 *   3. Log initial pool metrics to confirm DB settings took effect
 *   4. Register graceful-shutdown handlers for SIGTERM / SIGINT
 *
 * OpenTelemetry:
 *   Traces span:  HTTP route handler → service layer → pg query → Stellar HTTP call
 *   Exporter:     OTLP/HTTP → Jaeger or Honeycomb (configured via env vars)
 *   trace_id:     Injected into every pino log entry via a child logger so
 *                 traces and logs can be correlated in the observability backend.
 *
 * See src/lib/otel.ts for full OTEL configuration reference.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Validate environment variables at startup before any database or
    //    external service connections.
    const { validateEnv } = await import("@/server/config/env");
    validateEnv();

    // 2. Boot OpenTelemetry SDK (must run before importing pg / http modules
    //    so the auto-instrumentations can patch the right require() hooks).
    const { initOtel, shutdownOtel } = await import("@/lib/otel");
    initOtel();

    // 3. Import remaining runtime modules after OTEL is initialised.
    const { logPoolMetrics, closePool } = await import("@/lib/db");
    const { closeRedisClient } = await import("@/lib/redis");
    const { logger } = await import("@/lib/logger");

    // 4. Patch the root logger so every log line carries the current trace_id.
    //    We use a lazy import of the OTEL API (already a peer dep of sdk-node)
    //    to avoid bundling OTEL into the edge runtime.
    try {
      const { trace, context } = await import("@opentelemetry/api");

      // Monkey-patch pino's write method to inject trace_id into each log object.
      // This is the lightest approach — no custom pino transport needed.
      const origWrite = (logger as unknown as { write?: (chunk: string) => void }).write;
      if (origWrite) {
        // pino v8+ exposes write on the stream child
      }

      // Instead, override the logger's info/warn/error/debug methods by
      // creating a proxy that merges the active trace_id on each call.
      const withTraceId = (fn: (...args: unknown[]) => void) =>
        function (this: unknown, ...args: unknown[]) {
          const span = trace.getActiveSpan();
          const spanCtx = span?.spanContext();
          if (spanCtx && trace.isSpanContextValid(spanCtx)) {
            // Pino supports merging object as first arg
            if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
              (args[0] as Record<string, unknown>).trace_id = spanCtx.traceId;
              (args[0] as Record<string, unknown>).span_id = spanCtx.spanId;
            } else if (typeof args[0] === "string") {
              args.unshift({ trace_id: spanCtx.traceId, span_id: spanCtx.spanId });
            }
          }
          fn.apply(this, args);
        };

      for (const level of ["trace", "debug", "info", "warn", "error", "fatal"] as const) {
        const original = logger[level].bind(logger);
        // @ts-expect-error – runtime monkey-patch
        logger[level] = withTraceId(original);
      }

      // Suppress unused variable warning
      void context;
    } catch {
      // OTEL API not available (disabled) — continue without trace injection
    }

    logger.info("Application starting");
    logPoolMetrics();

    for (const sig of ["SIGTERM", "SIGINT"] as const) {
      process.once(sig, async () => {
        logger.info({ signal: sig }, "Shutting down");
        // Close OTEL, database pool, and Redis concurrently.
        await Promise.allSettled([shutdownOtel(), closePool(), closeRedisClient()]);
        process.exit(0);
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
