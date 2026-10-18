import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { indexEscrowEvents } from "@/server/services/event-indexer.service";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types";

/**
 * POST /api/v1/webhooks/stellar
 *
 * Receives pushed Stellar/Soroban escrow events from an external relay
 * (or direct webhook delivery mechanism) and applies them to the gift DB.
 *
 * Security:
 *   - Signature verified using HMAC-SHA256 with STELLAR_WEBHOOK_SECRET
 *   - Replay window enforced: events older than 5 minutes are rejected
 *   - Invalid signatures return 401 and are logged with enough context for
 *     incident investigation (no secret material logged)
 *
 * The handler delegates to the same `indexEscrowEvents` function used by the
 * polling cron job so event processing is idempotent regardless of delivery
 * mechanism.
 *
 * Signature header format:
 *   X-Lumigift-Signature: sha256=<hex-hmac>
 *   X-Lumigift-Timestamp: <unix-epoch-seconds>
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STELLAR_WEBHOOK_SECRET;

  // If no secret is configured, reject all requests to prevent accidental exposure
  if (!webhookSecret) {
    logger.error("STELLAR_WEBHOOK_SECRET is not configured — rejecting webhook request");
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Webhook endpoint not configured" },
      { status: 503 }
    );
  }

  // ── Verify signature and replay window ────────────────────────────────────
  const verification = await verifyWebhookSignature(req, webhookSecret);

  if (!verification.ok) {
    logger.warn(
      {
        reason: verification.reason,
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
        userAgent: req.headers.get("user-agent") ?? "unknown",
        timestamp: req.headers.get("x-lumigift-timestamp") ?? "missing",
      },
      "Stellar webhook rejected: invalid signature"
    );

    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized: " + verification.reason },
      { status: 401 }
    );
  }

  // ── Parse the event payload ────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(verification.rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("Stellar webhook rejected: invalid JSON body");
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const eventId = typeof payload.eventId === "string" ? payload.eventId : "unknown";
  const eventType = typeof payload.type === "string" ? payload.type : "unknown";

  logger.info({ eventId, eventType }, "Stellar webhook received — processing");

  // ── Delegate to the existing indexer (idempotent) ─────────────────────────
  try {
    const result = await indexEscrowEvents();

    logger.info(
      { eventId, eventType, processed: result.processed, skipped: result.skipped },
      "Stellar webhook processed"
    );

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error({ err, eventId, eventType }, "Stellar webhook processing failed");
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Internal error processing webhook event" },
      { status: 500 }
    );
  }
}
