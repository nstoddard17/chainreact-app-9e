/**
 * Public API-key trigger rate-limit SEAM (Slice 4.API-KEYS-FOUNDATION-5 / FK-4).
 *
 * ┌─ HONEST STATUS ─────────────────────────────────────────────────────────────┐
 * │ This is a SWAPPABLE SEAM, not a production-grade limiter. The default         │
 * │ implementation is PERMISSIVE (always allows). It exists so the public         │
 * │ trigger route has a single, well-typed chokepoint to call today and a real    │
 * │ limiter (per-key + per-account sliding window, durable across instances —     │
 * │ Upstash Redis / Postgres token bucket) can drop in WITHOUT touching the       │
 * │ route. See foundation plan §10.                                               │
 * │                                                                               │
 * │ BECAUSE no real backend is wired, the public endpoint MUST stay gated OFF     │
 * │ (`ENABLE_PUBLIC_API_KEYS` default false). Do NOT flip the flag ON in          │
 * │ production until this seam is replaced with a durable limiter. The execution  │
 * │ billing gate (1 task/run, refuse on exhaustion) is the only economic backstop │
 * │ in the meantime — it caps cost, not request rate.                             │
 * └───────────────────────────────────────────────────────────────────────────────┘
 *
 * An in-memory limiter is deliberately NOT shipped as the default: module-level
 * counters are per-instance (useless behind multiple serverless instances) and
 * would pretend to a guarantee we cannot make. A swap target should set
 * `allowed: false` + `retryAfterSeconds` when a window is exceeded; the route maps
 * that to a 429.
 */

export interface RateLimitInput {
  keyId: string;
  accountId: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (only when `!allowed`). */
  retryAfterSeconds?: number;
}

/**
 * Decide whether one API-key trigger request may proceed. DEFAULT: permissive
 * (always allowed) — see the file banner. Replace the body with a durable limiter
 * before enabling `ENABLE_PUBLIC_API_KEYS` in production.
 */
export async function rateLimitApiKeyTrigger(
  _input: RateLimitInput,
): Promise<RateLimitResult> {
  return { allowed: true };
}
