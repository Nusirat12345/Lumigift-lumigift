import { NextResponse } from "next/server";
import pool, { getPoolMetrics } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { serverConfig } from "@/server/config";

/**
 * Readiness probe — checks all dependencies before accepting traffic.
 * GET /api/health/ready
 *
 * Returns 200 when all checks pass; 503 when any dependency is degraded.
 *
 * Response shape:
 *   {
 *     status: "ok" | "degraded",
 *     timestamp: string,
 *     checks: { db: "ok"|"error", redis: "ok"|"error", horizon: "ok"|"error" },
 *     metrics: {
 *       db: { total, idle, waiting, min, max, idleTimeoutMs, connectionTimeoutMs },
 *       redis: { ... }
 *     }
 *   }
 *
 * Security: check status values are "ok" | "error" only — no connection
 * strings, stack traces, or internal details are ever returned.
 */
export async function GET() {
  const [db, redis, horizon] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkHorizon(serverConfig.stellar.horizonUrl),
  ]);

  const checks = { db, redis, horizon };
  const degraded = Object.values(checks).some((s) => s === "error");
  const status = degraded ? "degraded" : "ok";

  // Pool metrics are always included so operators can detect exhaustion
  const poolMetrics = getPoolMetrics();

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks,
      metrics: {
        db: poolMetrics,
      },
    },
    { status: degraded ? 503 : 200 }
  );
}

async function checkDb(): Promise<"ok" | "error"> {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "error"> {
  try {
    const client = await getRedisClient();
    await client.ping();
    return "ok";
  } catch {
    return "error";
  }
}

async function checkHorizon(url: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
