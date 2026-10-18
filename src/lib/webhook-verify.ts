/**
 * Webhook signature verification — HMAC-SHA256 with replay protection.
 *
 * Implements the same security model used by Stripe and GitHub webhooks:
 *   1. The sender computes HMAC-SHA256(secret, timestamp + "." + body)
 *   2. The signature is sent in the `X-Lumigift-Signature` header as
 *      "sha256=<hex-digest>"
 *   3. The timestamp is sent in the `X-Lumigift-Timestamp` header as a
 *      Unix epoch in seconds
 *   4. We recompute the expected signature and do a **timing-safe** comparison
 *   5. We reject events whose timestamp is more than REPLAY_WINDOW_SECONDS old
 *
 * Usage:
 *   import { verifyWebhookSignature } from "@/lib/webhook-verify";
 *
 *   const result = await verifyWebhookSignature(req, secret);
 *   if (!result.ok) {
 *     return NextResponse.json({ error: result.reason }, { status: 401 });
 *   }
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Events older than this (seconds) are rejected to prevent replay attacks. */
export const REPLAY_WINDOW_SECONDS = 5 * 60; // 5 minutes

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifies the HMAC-SHA256 signature on an incoming webhook request.
 *
 * @param req     - The incoming NextRequest (body read as text)
 * @param secret  - The shared secret (at least 32 characters recommended)
 * @returns       - `{ ok: true }` on success or `{ ok: false, reason }` on failure
 */
export async function verifyWebhookSignature(
  req: Request,
  secret: string
): Promise<{ ok: true; rawBody: string } | { ok: false; reason: string }> {
  // ── 1. Extract headers ─────────────────────────────────────────────────────
  const signatureHeader = req.headers.get("x-lumigift-signature");
  const timestampHeader = req.headers.get("x-lumigift-timestamp");

  if (!signatureHeader) {
    return { ok: false, reason: "Missing X-Lumigift-Signature header" };
  }
  if (!timestampHeader) {
    return { ok: false, reason: "Missing X-Lumigift-Timestamp header" };
  }

  // ── 2. Validate and parse timestamp ────────────────────────────────────────
  const timestamp = parseInt(timestampHeader, 10);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, reason: "Invalid X-Lumigift-Timestamp value" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - timestamp;

  if (ageSeconds > REPLAY_WINDOW_SECONDS) {
    return {
      ok: false,
      reason: `Webhook event too old (age: ${ageSeconds}s, window: ${REPLAY_WINDOW_SECONDS}s)`,
    };
  }

  if (ageSeconds < -30) {
    // Allow 30 seconds of clock skew in the other direction
    return { ok: false, reason: "Webhook timestamp is too far in the future" };
  }

  // ── 3. Extract and validate signature format ───────────────────────────────
  if (!signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "Signature must use sha256= prefix" };
  }
  const receivedSig = signatureHeader.slice(7); // strip "sha256="

  // ── 4. Read raw body (must not be parsed before this point) ───────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return { ok: false, reason: "Failed to read request body" };
  }

  // ── 5. Compute expected signature ─────────────────────────────────────────
  // Signed payload: "<timestamp>.<raw_body>"
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // ── 6. Timing-safe comparison ─────────────────────────────────────────────
  let signaturesMatch: boolean;
  try {
    signaturesMatch = timingSafeEqual(
      Buffer.from(receivedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    // Buffer lengths differ → definitely not equal
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    return { ok: false, reason: "Signature mismatch" };
  }

  return { ok: true, rawBody };
}

/**
 * Generates the HMAC-SHA256 signature for a given payload.
 * Useful for testing and for the sender side (e.g. integration tests).
 *
 * @param secret    - The shared secret
 * @param body      - The raw request body string
 * @param timestamp - Unix epoch in seconds (defaults to now)
 */
export function signWebhookPayload(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): { signature: string; timestamp: number } {
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return { signature: `sha256=${signature}`, timestamp };
}
