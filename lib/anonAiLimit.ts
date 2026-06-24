import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * REACT-LIVE-SKELETON-3 — best-effort anonymous AI-planning limit (server-only).
 *
 * Anonymous visitors get a small, capped number of AI planning attempts before sign-up. With NO DB /
 * KV available (and no migration this slice), the limit is enforced two ways, both best-effort and
 * honestly weak:
 *
 *   1. PRIMARY — a server-set, HttpOnly, day-bucketed cookie carrying the count, HMAC-SIGNED. The
 *      signing key is `ANON_AI_LIMIT_SIGNING_KEY` if set, else the established `OAUTH_STATE_SIGNING_KEY`
 *      (same HMAC key class; the cookie carries no secret, only count + day + signature). The client
 *      cannot forge a count (a tampered/invalid cookie reads as 0 → a FRESH allowance, never an inflated
 *      one). Stateless → works across instances. Inherent bypass: clearing cookies grants a fresh window
 *      — acceptable for an anonymous, no-account preview, and bounded by (2).
 *   2. BACKSTOP — a per-instance, in-memory IP/day soft cap. Catches naive cookie-clear loops from one
 *      IP. Per-instance only (resets on deploy; multi-instance dilutes it). Not a hard guarantee.
 *
 * PRODUCTION REQUIRES A SIGNING KEY. Without one the cookie would be UNSIGNED and therefore forgeable —
 * a visitor could pin their count at 0 and get unlimited free model-backed planning. So in production,
 * with no key configured, anonymous AI planning is unavailable (the route fails closed; see
 * `isAnonAiPlanningAvailable`) rather than emitting an unsigned cap or running uncapped. In dev/test an
 * unsigned cookie is acceptable (no real abuse surface, zero-config local setup) — tests assert this is
 * non-production-only behavior.
 *
 * Honest weakness: neither is durable/cross-instance-perfect without a shared store. This is the safest
 * no-infra mechanism; a durable KV-backed limit is the follow-up. No secrets/PII are stored; the
 * cookie holds only an integer count + day bucket + signature.
 *
 * Server-only: uses `node:crypto`. Pure parse/serialize fns are passed `now` for testability.
 */

export const ANON_AI_LIMIT = 3;
export const ANON_AI_COOKIE_NAME = "cr_anon_ai";
const COOKIE_MAX_AGE_S = 86_400; // 1 day
const DOMAIN_PREFIX = "anon-ai-limit:v1";

// Per-instance IP/day soft cap (backstop).
const IP_DAILY_CAP = 30;
const MAX_TRACKED_IPS = 10_000;
const ipHits = new Map<string, { count: number; day: number }>();

function dayBucket(now: number): number {
  return Math.floor(now / 86_400_000);
}

function getSigningKey(): Buffer | null {
  const raw = process.env.ANON_AI_LIMIT_SIGNING_KEY || process.env.OAUTH_STATE_SIGNING_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length >= 16 ? buf : null;
  } catch {
    return null;
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** True when a usable signing key is configured (cap cookies will be HMAC-signed). */
export function isAnonAiLimitSigned(): boolean {
  return getSigningKey() !== null;
}

/**
 * Whether anonymous AI planning may run in the current environment.
 *
 * Production REQUIRES a signing key — an unsigned limit cookie is forgeable (a visitor could pin their
 * count at 0 forever and get unlimited free model-backed planning), so we refuse to run rather than emit
 * an unsigned cap or run uncapped. In dev/test an unsigned cookie is acceptable, so planning is always
 * available there. The route calls this BEFORE reading the cookie / parsing the body / calling the model
 * and fails closed when it returns false — no model call, no cookie, no attempt consumed.
 */
export function isAnonAiPlanningAvailable(): boolean {
  return isAnonAiLimitSigned() || !isProductionRuntime();
}

function sign(count: number, day: number, key: Buffer): string {
  return createHmac("sha256", key).update(`${DOMAIN_PREFIX}:${count}:${day}`).digest("base64url");
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * The consumed-attempt count from the signed cookie for TODAY. Returns 0 for absent / malformed /
 * tampered / stale-day cookies (a fresh allowance — never an inflated one). When no signing key is
 * configured the count is read unsigned — a dev/test-only path; in production the route refuses to run
 * without a key (`isAnonAiPlanningAvailable`), so this is never reached unsigned in prod.
 */
export function readAnonAiCount(cookieHeader: string | null, now: number): number {
  const value = readCookie(cookieHeader, ANON_AI_COOKIE_NAME);
  if (!value) return 0;
  const parts = value.split(".");
  const count = Number(parts[0]);
  const day = Number(parts[1]);
  if (!Number.isInteger(count) || count < 0 || count > 1_000) return 0;
  if (day !== dayBucket(now)) return 0; // new day → fresh allowance
  const key = getSigningKey();
  if (key) {
    const provided = parts[2] ?? "";
    const expected = sign(count, day, key);
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return 0; // bad signature → fresh allowance
    } catch {
      return 0;
    }
  }
  return count;
}

/** Cookie value for an updated count (signed when a key is configured). */
export function serializeAnonAiCookieValue(count: number, now: number): string {
  const day = dayBucket(now);
  const key = getSigningKey();
  if (key) return `${count}.${day}.${sign(count, day, key)}`;
  // Defense in depth: the route gates on isAnonAiPlanningAvailable() before reaching here, so an
  // unsigned (forgeable) cap cookie can never be emitted in production. If that gate were ever
  // bypassed, fail loudly rather than silently hand out an unsigned allowance.
  if (isProductionRuntime()) {
    throw new Error("Refusing to emit an unsigned anonymous-AI limit cookie in production.");
  }
  return `${count}.${day}`;
}

/** Standard cookie options for the anon-AI counter (HttpOnly so browser JS can't read/forge it). */
export function anonAiCookieOptions(isProd: boolean): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, sameSite: "lax", secure: isProd, path: "/", maxAge: COOKIE_MAX_AGE_S };
}

/** True when this IP has already hit the per-instance daily soft cap (backstop only). */
export function ipSoftCapReached(ip: string, now: number): boolean {
  const day = dayBucket(now);
  const entry = ipHits.get(ip);
  if (!entry || entry.day !== day) return false;
  return entry.count >= IP_DAILY_CAP;
}

/** Record one consumed attempt for an IP (per-instance, day-bucketed). */
export function recordIpHit(ip: string, now: number): void {
  if (ipHits.size > MAX_TRACKED_IPS) ipHits.clear();
  const day = dayBucket(now);
  const entry = ipHits.get(ip);
  if (!entry || entry.day !== day) ipHits.set(ip, { count: 1, day });
  else entry.count += 1;
}

/** Test-only reset for the in-memory IP backstop. */
export function __resetIpSoftCapForTests(): void {
  ipHits.clear();
}
