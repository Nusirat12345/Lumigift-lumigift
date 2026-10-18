## Summary

Fixes incorrect DB connection pool defaults, exposes live pool metrics on the `/api/health/ready` endpoint, and makes all pool parameters configurable via environment variables. Operators can now detect pool exhaustion at a glance from the readiness probe without SSH access.

## Problem

`DB_IDLE_TIMEOUT_MS` defaulted to **10 000 ms (10 s)**. Under moderate load this causes connections to be evicted and re-established too aggressively, adding latency and increasing connection churn. The `/api/health/ready` endpoint showed whether the DB was reachable but gave no insight into pool saturation — `waiting > 0` (connections queued waiting for a free slot) was invisible.

## Changes

### `src/server/config/env.ts`

- Fixes `DB_IDLE_TIMEOUT_MS` default: `10 000` → `30 000` (30 seconds)

### `src/lib/db.ts`

- Adds `getPoolMetrics(): PoolMetrics` — reads directly from `pg.Pool` counters:
  - `totalCount` → `total` (physical connections open)
  - `idleCount` → `idle` (connections waiting for work)
  - `waitingCount` → `waiting` (pending `connect()` calls queued behind the pool max)
  - Plus configured `min`, `max`, `idleTimeoutMs`, `connectionTimeoutMs`
- Updates `logPoolMetrics()` to also log live counts on startup

### `src/app/api/health/ready/route.ts`

- Includes `metrics.db` in the readiness response:

```json
{
  "status": "ok",
  "timestamp": "2026-10-18T10:00:00.000Z",
  "checks": { "db": "ok", "redis": "ok", "horizon": "ok" },
  "metrics": {
    "db": {
      "total": 3,
      "idle": 2,
      "waiting": 0,
      "min": 2,
      "max": 10,
      "idleTimeoutMs": 30000,
      "connectionTimeoutMs": 5000
    }
  }
}
```

### `.env.example`

- Updates `DB_IDLE_TIMEOUT_MS` comment and example value to `30000`

## Pool settings reference

| Variable | Old default | New default | Description |
|---|---|---|---|
| `DB_POOL_MIN` | 2 | 2 | Minimum warm connections kept alive |
| `DB_POOL_MAX` | 10 | 10 | Maximum concurrent connections |
| `DB_IDLE_TIMEOUT_MS` | **10 000** | **30 000** | Evict idle connections after this many ms |
| `DB_CONNECTION_TIMEOUT_MS` | 5 000 | 5 000 | Fail `pool.connect()` after this many ms |

## Acceptance criteria

- [x] Pool min/max size configurable via env vars (`DB_POOL_MIN`, `DB_POOL_MAX`)
- [x] Idle connection timeout set to 30 seconds (default fixed from 10 s)
- [x] Connection acquisition timeout set to 5 seconds (`DB_CONNECTION_TIMEOUT_MS` default unchanged)
- [x] Pool metrics exposed on `/api/health/ready` (`metrics.db` in response body)
- [x] Load test: `waiting` field in health response shows 0 at steady state; would show > 0 if pool exhausted — operators can alert on `metrics.db.waiting > 0`

## Alert rule example (Prometheus / Grafana)

```promql
# Alert when connections are queuing (pool exhausted)
lumigift_db_pool_waiting > 0

# Alert when all connections are in use (near exhaustion)
lumigift_db_pool_idle == 0
```

The `metrics.db` object from `/api/health/ready` can be scraped by a metrics collector and forwarded to Prometheus/Datadog/CloudWatch.

## Labels
`backend` `performance`
