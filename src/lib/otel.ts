/**
 * OpenTelemetry SDK bootstrap.
 *
 * Configures distributed tracing for the Node.js runtime covering:
 *   - Incoming HTTP requests (Next.js route handlers)
 *   - Outgoing HTTP calls (Stellar Horizon / Soroban RPC)
 *   - PostgreSQL queries via pg instrumentation
 *
 * Traces are exported via OTLP/HTTP to Jaeger or Honeycomb depending on
 * the configured environment variables.
 *
 * Environment variables:
 *   OTEL_ENABLED            — Set to "true" to enable (default: false in dev)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — Full OTLP endpoint URL
 *                              Jaeger:   http://localhost:4318
 *                              Honeycomb: https://api.honeycomb.io
 *   OTEL_EXPORTER_OTLP_HEADERS  — Comma-separated key=value headers
 *                              Honeycomb: x-honeycomb-team=<API_KEY>,x-honeycomb-dataset=lumigift
 *   OTEL_SERVICE_NAME       — Override service name (default: lumigift)
 *   OTEL_SAMPLE_RATE        — Tail-sampling ratio 0–1 (default: 1.0)
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";

let sdk: NodeSDK | null = null;

/**
 * Initialise and start the OpenTelemetry SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initOtel(): void {
  if (sdk) return;

  const otelEnabled =
    process.env.OTEL_ENABLED === "true" ||
    (process.env.NODE_ENV === "production" && !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

  if (!otelEnabled) {
    return;
  }

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

  // Parse key=value pairs from OTEL_EXPORTER_OTLP_HEADERS
  const headersRaw = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "";
  const headers: Record<string, string> = {};
  if (headersRaw) {
    for (const pair of headersRaw.split(",")) {
      const idx = pair.indexOf("=");
      if (idx !== -1) {
        headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    }
  }

  const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE ?? "1.0");
  const sampler = new TraceIdRatioBasedSampler(
    Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1 ? sampleRate : 1.0
  );

  const serviceName = process.env.OTEL_SERVICE_NAME ?? "lumigift";
  const serviceVersion = process.env.npm_package_version ?? "0.0.0";

  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "development",
    }),
    traceExporter: exporter,
    sampler,
    instrumentations: [
      new HttpInstrumentation({
        // Ignore internal Next.js probes and healthchecks to reduce noise
        ignoreIncomingRequestHook: (req) => {
          const url = req.url ?? "";
          return (
            url.startsWith("/api/health") ||
            url.startsWith("/_next") ||
            url === "/favicon.ico"
          );
        },
      }),
      new PgInstrumentation({
        // Add db.statement to spans for slow-query visibility
        enhancedDatabaseReporting: true,
      }),
    ],
  });

  sdk.start();
}

/**
 * Gracefully shut down the OTEL SDK, flushing any pending spans.
 * Call this during process shutdown alongside pool.end() and redis.quit().
 */
export async function shutdownOtel(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error("[otel] shutdown error:", err);
  } finally {
    sdk = null;
  }
}
