import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Channel token sign + verify.
 *
 * Replaces V1's "store JSON metadata in the token field" approach. V2's
 * channel token is an HMAC-SHA256 of the channelId, keyed on
 * `WATCH_CHANNEL_SECRET`. The receive route verifies the HMAC against
 * the channelId from the inbound `X-Goog-Channel-Id` header — any
 * tampering (different channelId, forged token) fails the constant-time
 * compare and the route returns 401.
 *
 * Why HMAC over the channelId alone: an attacker who learns a real
 * channelId (it's not secret — Google echoes it back to the receive
 * endpoint) can forge a notification only if they ALSO know the secret.
 * The secret never leaves V2.
 *
 * Channel metadata (workflowId, nodeId, calendarId, syncToken) is
 * recovered from the trigger_resources row keyed by channelId — the
 * token doesn't need to carry it.
 */

function getSecret(): string {
  const secret = process.env.WATCH_CHANNEL_SECRET;
  if (!secret) {
    throw new Error("WATCH_CHANNEL_SECRET env var is not set.");
  }
  return secret;
}

export interface ChannelTokenInput {
  channelId: string;
}

export function buildChannelToken(input: ChannelTokenInput): string {
  return createHmac("sha256", getSecret())
    .update(input.channelId)
    .digest("base64url");
}

export function verifyChannelToken(
  input: ChannelTokenInput,
  presentedToken: string,
): boolean {
  const expected = buildChannelToken(input);
  // Length check first — timingSafeEqual throws on length mismatch.
  if (expected.length !== presentedToken.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(presentedToken),
    );
  } catch {
    return false;
  }
}
