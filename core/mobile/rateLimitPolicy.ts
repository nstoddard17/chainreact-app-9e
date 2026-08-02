import { createHash } from "node:crypto";

/**
 * Mobile API rate-limit POLICY (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Pure data + math, mirroring core/apiKeys/rateLimitPolicy.ts and
 * core/mcp/rateLimitPolicy.ts. Storage reuses the generic durable bucket
 * counters (repositories/mcpRateLimits.ts — the RPC atomically bumps two
 * named text buckets; nothing about it is MCP-semantic); mobile owns its own
 * key namespace, limits, and decision here.
 *
 * Dimensions:
 *   - per verified USER — the authoritative bound. Always enforced; a
 *     missing/rotating device id can never bypass it.
 *   - per DEVICE (optional `x-chainreact-device` header) — a secondary,
 *     more generous bucket. Keyed by sha256(userId:deviceId) so a raw device
 *     identifier never becomes a durable key.
 *   - public APP-CONFIG — keyed by sha256(client IP): the only stable
 *     non-user key available pre-auth. The hash keeps raw IPs out of the
 *     table and logs.
 *
 * Limits size for foreground refresh + short polling of a queued/running run
 * (~1 request/second bursts across a handful of screens).
 */

export const MOBILE_RATE_LIMIT_WINDOW_SECONDS = 60;

export const MOBILE_RATE_LIMITS = {
  perUser: 120,
  perDevice: 240,
  publicPerIp: 60,
} as const;
export type MobileRateLimits = typeof MOBILE_RATE_LIMITS;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Floor a timestamp to the start of its fixed window (epoch-aligned). */
export function alignMobileWindowStartMs(
  nowMs: number,
  windowSeconds: number = MOBILE_RATE_LIMIT_WINDOW_SECONDS,
): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Authenticated buckets. The user bucket is always present and always
 * authoritative. The storage RPC takes exactly two buckets and bumps BOTH
 * unconditionally (two sequential upserts — the same key twice would
 * double-count), so when no valid device id was supplied the second slot gets
 * a distinct per-user SHADOW key whose count is deliberately ignored
 * (`deviceBucketDistinct: false`). A missing or rotating device id therefore
 * never bypasses — or inflates — the user limit.
 */
export function buildMobileRateLimitBucketKeys(input: {
  userId: string;
  deviceId: string | null;
  windowStartMs: number;
}): { user: string; device: string; deviceBucketDistinct: boolean } {
  const w = input.windowStartMs;
  const user = `mobilev1:user:${input.userId}:${w}`;
  if (input.deviceId === null) {
    return { user, device: `mobilev1:devshadow:${input.userId}:${w}`, deviceBucketDistinct: false };
  }
  return {
    user,
    device: `mobilev1:dev:${sha256Hex(`${input.userId}:${input.deviceId}`)}:${w}`,
    deviceBucketDistinct: true,
  };
}

/**
 * Public app-config buckets — a hashed-IP dimension plus an ignored distinct
 * shadow key for the RPC's second slot (same double-bump rationale as above).
 */
export function buildMobilePublicBucketKeys(input: {
  ip: string;
  windowStartMs: number;
}): { ip: string; shadow: string } {
  const hash = sha256Hex(input.ip);
  return {
    ip: `mobilev1:ip:${hash}:${input.windowStartMs}`,
    shadow: `mobilev1:ipshadow:${hash}:${input.windowStartMs}`,
  };
}

/**
 * Validate the optional device-id header value. Anything outside the strict
 * shape is treated as ABSENT (never an error, never a bypass — the user
 * bucket still counts).
 */
export function normalizeMobileDeviceId(raw: string | null): string | null {
  if (raw === null) return null;
  return /^[A-Za-z0-9._-]{8,64}$/.test(raw) ? raw : null;
}

export interface MobileRateLimitDecision {
  allowed: boolean;
  /** Present only when denied; positive integer seconds. */
  retryAfterSeconds?: number;
}

export function evaluateMobileRateLimit(input: {
  counts: { user: number; device: number };
  deviceBucketDistinct: boolean;
  nowMs: number;
  windowStartMs: number;
  limits?: MobileRateLimits;
}): MobileRateLimitDecision {
  const limits = input.limits ?? MOBILE_RATE_LIMITS;
  const exceeded =
    input.counts.user > limits.perUser ||
    (input.deviceBucketDistinct && input.counts.device > limits.perDevice);
  if (!exceeded) return { allowed: true };
  const windowEndMs =
    input.windowStartMs + MOBILE_RATE_LIMIT_WINDOW_SECONDS * 1000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - input.nowMs) / 1000)),
  };
}

export function evaluateMobilePublicRateLimit(input: {
  count: number;
  nowMs: number;
  windowStartMs: number;
  limits?: MobileRateLimits;
}): MobileRateLimitDecision {
  const limits = input.limits ?? MOBILE_RATE_LIMITS;
  if (input.count <= limits.publicPerIp) return { allowed: true };
  const windowEndMs =
    input.windowStartMs + MOBILE_RATE_LIMIT_WINDOW_SECONDS * 1000;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - input.nowMs) / 1000)),
  };
}
