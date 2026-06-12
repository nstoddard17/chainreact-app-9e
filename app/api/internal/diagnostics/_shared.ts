import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Machine gate for the internal diagnostics API (Slice 4.MCP-STAGE-2B-1).
 *
 * Underscore-prefixed: NOT a route. Shared by every
 * `/api/internal/diagnostics/*` handler.
 *
 * This surface is reached by the internal MCP diagnostic tool (a headless
 * `node:fetch` client), NOT by a browser. So it deliberately does NOT use
 * `requireUser()` — the MCP has no cookie. The trust boundary is a shared bearer
 * secret distinct from `MCP_HTTP_TOKEN`; the diagnosis *subject* is an explicit
 * `userId` in the request body, and the underlying service still applies the V2
 * credential-sharing policy under that subject (so the bearer cannot reach a
 * credential the live route wouldn't reach for the same subject).
 *
 * Gate order (capability non-disclosure first):
 *   1. `DIAGNOSTICS_API_ENABLED` truthy — else 404 (the route behaves as if it
 *      does not exist; never 403, which would confirm it exists).
 *   2. In production, ALSO require `DIAGNOSTICS_API_ALLOW_PROD` truthy — else 404.
 *   3. `DIAGNOSTICS_API_TOKEN` set AND presented bearer matches (constant-time) —
 *      else 401. A 401 is only ever returned once the route is enabled, so a
 *      disabled environment leaks nothing.
 *
 * The token is read from the environment only and is never logged or echoed.
 */

export interface GateOk {
  readonly ok: true;
}
export interface GateFail {
  readonly ok: false;
  readonly response: NextResponse;
}
export type GateResult = GateOk | GateFail;

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Constant-time compare. Length mismatch short-circuits (length is not secret). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extract a presented bearer token, or null. */
function presentedBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m && m[1] ? m[1].trim() : null;
}

const notFound = (): NextResponse =>
  NextResponse.json({ error: "not_found" }, { status: 404 });

/**
 * Apply the machine gate to a request. Returns `{ ok: true }` when the request
 * may proceed, or `{ ok: false, response }` with the exact NextResponse to
 * return. Reads env via the optional `env` arg (defaults to `process.env`) so
 * tests can drive every branch deterministically.
 */
export function applyDiagnosticsGate(
  req: Request,
  env: Record<string, string | undefined> = process.env,
): GateResult {
  // 1. Disabled → 404 (non-disclosure), regardless of bearer.
  if (!isTruthyEnv(env.DIAGNOSTICS_API_ENABLED)) {
    return { ok: false, response: notFound() };
  }

  // 2. Production lock → 404 unless explicitly allowed.
  if (env.NODE_ENV === "production" && !isTruthyEnv(env.DIAGNOSTICS_API_ALLOW_PROD)) {
    return { ok: false, response: notFound() };
  }

  // 3. Bearer (constant-time). A missing server token fails closed.
  const expected = (env.DIAGNOSTICS_API_TOKEN ?? "").trim();
  const presented = presentedBearer(req);
  if (!expected || !presented || !safeEqual(presented, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}
