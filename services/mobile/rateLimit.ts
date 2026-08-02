import {
  MOBILE_RATE_LIMIT_WINDOW_SECONDS,
  alignMobileWindowStartMs,
  buildMobileRateLimitBucketKeys,
  buildMobilePublicBucketKeys,
  evaluateMobileRateLimit,
  evaluateMobilePublicRateLimit,
  type MobileRateLimitDecision,
} from "@/core/mobile/rateLimitPolicy";
import { incrementMcpRateLimitWindowsServiceRole } from "@/repositories/mcpRateLimits";

/**
 * Mobile API rate limiter (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Mobile-OWNED policy + orchestration over the shared durable bucket-counter
 * storage (`mcp_rate_limits` + its atomic two-bucket increment RPC — the
 * storage is a generic `(bucket text, window) → count` table; nothing about
 * it is MCP-semantic, and the `mobilev1:` key prefix keeps the namespaces
 * disjoint). Reusing it means: durable, cross-instance, and ZERO new
 * migrations for M1.
 *
 * OUTAGE POLICY (explicit): counter-storage failure FAILS OPEN for this
 * read-only namespace — identity is already verified, the endpoints are
 * reads, and refusing every mobile request during a counter outage is worse
 * than briefly losing throttling. The failure is logged (bounded, no keys).
 * Revisit before any mutating (M2) endpoint ships — writes flip to
 * fail-closed.
 *
 * Nothing sensitive becomes a durable key or a log line: user buckets carry
 * the (non-secret) user id; device and IP dimensions are sha256-hashed in
 * the policy before they ever reach storage.
 */

export type { MobileRateLimitDecision } from "@/core/mobile/rateLimitPolicy";

export async function rateLimitMobileUser(input: {
  userId: string;
  /** Already-normalized device id (or null). Never bypasses the user bucket. */
  deviceId: string | null;
}): Promise<MobileRateLimitDecision> {
  const nowMs = Date.now();
  const windowStartMs = alignMobileWindowStartMs(nowMs);
  const buckets = buildMobileRateLimitBucketKeys({
    userId: input.userId,
    deviceId: input.deviceId,
    windowStartMs,
  });
  try {
    const counts = await incrementMcpRateLimitWindowsServiceRole({
      tokenBucket: buckets.user,
      accountBucket: buckets.device,
      windowStart: new Date(windowStartMs).toISOString(),
      expiresAt: new Date(
        windowStartMs + MOBILE_RATE_LIMIT_WINDOW_SECONDS * 1000,
      ).toISOString(),
    });
    return evaluateMobileRateLimit({
      counts: { user: counts.token, device: counts.account },
      deviceBucketDistinct: buckets.deviceBucketDistinct,
      nowMs,
      windowStartMs,
    });
  } catch {
    console.error("[mobile.v1] rate-limit storage unavailable — failing open (read-only namespace)");
    return { allowed: true };
  }
}

export async function rateLimitMobilePublic(input: {
  /** Client IP (first x-forwarded-for hop); hashed by the policy. */
  ip: string;
}): Promise<MobileRateLimitDecision> {
  const nowMs = Date.now();
  const windowStartMs = alignMobileWindowStartMs(nowMs);
  const buckets = buildMobilePublicBucketKeys({ ip: input.ip, windowStartMs });
  try {
    const counts = await incrementMcpRateLimitWindowsServiceRole({
      tokenBucket: buckets.ip,
      accountBucket: buckets.shadow,
      windowStart: new Date(windowStartMs).toISOString(),
      expiresAt: new Date(
        windowStartMs + MOBILE_RATE_LIMIT_WINDOW_SECONDS * 1000,
      ).toISOString(),
    });
    return evaluateMobilePublicRateLimit({
      count: counts.token,
      nowMs,
      windowStartMs,
    });
  } catch {
    console.error("[mobile.v1] public rate-limit storage unavailable — failing open");
    return { allowed: true };
  }
}
