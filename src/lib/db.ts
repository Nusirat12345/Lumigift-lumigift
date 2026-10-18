import { Pool } from "pg";
import { serverConfig } from "@/server/config";

const pool = new Pool({
  connectionString: serverConfig.database.url,
  min: serverConfig.database.poolMin,
  max: serverConfig.database.poolMax,
  idleTimeoutMillis: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMillis: serverConfig.database.connectionTimeoutMs,
});

pool.on("connect", () => {
  // Fires for each new physical connection added to the pool
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/**
 * Returns a snapshot of the current connection pool metrics.
 * Suitable for inclusion in health-check responses.
 *
 * Fields:
 *   total       — total physical connections (idle + active)
 *   idle        — connections sitting in the pool waiting for work
 *   waiting     — client.connect() calls queued waiting for a free slot
 *   min         — configured pool minimum
 *   max         — configured pool maximum
 *   idleTimeout — idle timeout in ms
 *   connectionTimeout — connection acquisition timeout in ms
 */
export interface PoolMetrics {
  total: number;
  idle: number;
  waiting: number;
  min: number;
  max: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export function getPoolMetrics(): PoolMetrics {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    min: serverConfig.database.poolMin,
    max: serverConfig.database.poolMax,
    idleTimeoutMs: serverConfig.database.idleTimeoutMs,
    connectionTimeoutMs: serverConfig.database.connectionTimeoutMs,
  };
}

/**
 * Logs the current connection pool configuration and live metrics to stdout.
 * Useful for verifying pool settings on application startup.
 */
export function logPoolMetrics() {
  const m = getPoolMetrics();
  console.log(
    `[db] Pool ready — min: ${m.min}, max: ${m.max}, ` +
      `idleTimeout: ${m.idleTimeoutMs}ms, connectionTimeout: ${m.connectionTimeoutMs}ms | ` +
      `live: total=${m.total}, idle=${m.idle}, waiting=${m.waiting}`
  );
}

/**
 * Gracefully drains and closes all connections in the pool.
 * Should be called during application shutdown to avoid connection leaks.
 *
 * @returns Resolves when all connections have been closed.
 */
export async function closePool() {
  await pool.end();
  console.log("[db] Pool closed.");
}

export default pool;
