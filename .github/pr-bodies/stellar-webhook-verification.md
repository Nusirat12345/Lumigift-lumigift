## Summary

Adds HMAC-SHA256 webhook signature verification with replay-attack protection for the Stellar event webhook endpoint. A new `POST /api/v1/webhooks/stellar` route rejects any request whose signature is invalid or whose timestamp is older than 5 minutes. Invalid requests return `401` and are logged with IP, user-agent, and timestamp for SIEM alerting — no secret material is ever logged.

## Problem

The event indexer currently polls Stellar. If a webhook delivery mechanism is added, without signature verification any attacker who knows the URL can send forged events and trigger gift state changes (e.g. marking a gift as `claimed` without a real Stellar transaction).

## Changes

### New files

**`src/lib/webhook-verify.ts`**
- `verifyWebhookSignature(req, secret)` — full verification pipeline:
  1. Reads `X-Lumigift-Signature: sha256=<hex>` and `X-Lumigift-Timestamp: <epoch>`
  2. Validates timestamp is within ±5 min window (300 s replay window, 30 s clock-skew tolerance)
  3. Recomputes `HMAC-SHA256(secret, "<timestamp>.<raw_body>")` — same pattern as Stripe/GitHub
  4. Uses `crypto.timingSafeEqual` to prevent timing attacks
  5. Returns typed `{ ok: true, rawBody }` or `{ ok: false, reason }` — never throws
- `signWebhookPayload(secret, body, timestamp?)` — sender-side helper for integration tests

**`src/app/api/v1/webhooks/stellar/route.ts`**
- `POST /api/v1/webhooks/stellar` handler
- Fails closed: returns `503` if `STELLAR_WEBHOOK_SECRET` is not configured
- Returns `401` with reason string on any verification failure
- Logs `{ reason, ip, userAgent, timestamp }` on rejection (no secret in log)
- Delegates to `indexEscrowEvents()` on success (idempotent — same function as cron job)

### Modified files
- **`src/server/config/env.ts`** — adds `STELLAR_WEBHOOK_SECRET` (optional, min 32 chars)
- **`.env.example`** — documents the new secret with generation command

## Signed payload format

```
HMAC-SHA256(secret, "${timestamp}.${rawBody}")
```

Request headers:
```
X-Lumigift-Signature: sha256=<64-char hex digest>
X-Lumigift-Timestamp: 1729245600
Content-Type: application/json
```

## Acceptance criteria

- [x] Webhook signature computed using HMAC-SHA256 with a shared secret
- [x] Signature verified before processing any event payload
- [x] Replay window enforced — events older than 5 minutes rejected (`REPLAY_WINDOW_SECONDS = 300`)
- [x] Invalid signatures return `401` and are logged
- [x] `signWebhookPayload()` helper enables integration test sending a spoofed webhook and asserting rejection

## Testing a spoofed webhook

```bash
# Valid request (should succeed when STELLAR_WEBHOOK_SECRET is set):
BODY='{"eventId":"evt_123","type":"initialized"}'
TIMESTAMP=$(date +%s)
SECRET="your-stellar-webhook-secret-here-min32chars"
SIG=$(echo -n "${TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$2}')

curl -X POST http://localhost:3000/api/v1/webhooks/stellar \
  -H "Content-Type: application/json" \
  -H "X-Lumigift-Signature: $SIG" \
  -H "X-Lumigift-Timestamp: $TIMESTAMP" \
  -d "$BODY"

# Spoofed request (should return 401):
curl -X POST http://localhost:3000/api/v1/webhooks/stellar \
  -H "Content-Type: application/json" \
  -H "X-Lumigift-Signature: sha256=deadbeef" \
  -H "X-Lumigift-Timestamp: $TIMESTAMP" \
  -d "$BODY"

# Replayed request (timestamp > 5 min old, should return 401):
OLD_TIMESTAMP=$((TIMESTAMP - 400))
OLD_SIG=$(echo -n "${OLD_TIMESTAMP}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$2}')
curl -X POST http://localhost:3000/api/v1/webhooks/stellar \
  -H "Content-Type: application/json" \
  -H "X-Lumigift-Signature: $OLD_SIG" \
  -H "X-Lumigift-Timestamp: $OLD_TIMESTAMP" \
  -d "$BODY"
```

## Labels
`backend` `security`
