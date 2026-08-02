import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { MobileErrorCode } from "@chainreact/mobile-contracts";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import { listByIdsServiceRole } from "@/repositories/accounts";
import { isMobileApiEnabled } from "@/services/mobile/flags";
import {
  rateLimitMobileUser,
  rateLimitMobilePublic,
} from "@/services/mobile/rateLimit";
import { normalizeMobileDeviceId } from "@/core/mobile/rateLimitPolicy";
import type { MembershipRole } from "@/contracts/accounts";

/**
 * THE dedicated mobile authentication/authorization gate
 * (MOBILE-COMPANION-M1-MOBILE-READ-API-1). Underscore-prefixed: not a route;
 * importable from sibling route.ts files only.
 *
 * Identity contract — Supabase USER bearer tokens ONLY:
 *   - exactly one `Authorization: Bearer <token>` header;
 *   - verified SERVER-SIDE via `auth.getUser(token)` (never decoded claims);
 *   - NO cookie fallback (this module never touches `utils/supabase/server`);
 *   - NO service-role identity fallback;
 *   - other ChainReact bearer formats (`crk_` API keys, `crmcp_` MCP tokens,
 *     cron/diagnostics secrets) are rejected WITHOUT ever reaching Supabase —
 *     the customer-token prefixes cheaply, everything else by failing
 *     verification. Web cookie authentication is untouched.
 *
 * Namespace flag: while `ENABLE_MOBILE_API` is not exactly "true", EVERY
 * response — app-config included — is a bare no-leak 404.
 *
 * Account scope: `{accountId}` always comes from the URL; membership is
 * checked per request via service-role reads keyed by the VERIFIED user.
 * Non-member and nonexistent collapse to the same 404. The web
 * active-account pointer is never read for authority and never written.
 */

const errorBody = (error: string, code?: MobileErrorCode) =>
  code === undefined ? { error } : { error, code };

export function mobileNamespaceDisabledResponse(): NextResponse {
  // Indistinguishable from an unknown path — reveals nothing.
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export function mobileNotFoundResponse(code: MobileErrorCode = "NOT_FOUND"): NextResponse {
  return NextResponse.json(errorBody("Not found.", code), { status: 404 });
}

export function mobileErrorResponse(
  status: number,
  code: MobileErrorCode,
  message: string,
): NextResponse {
  return NextResponse.json(errorBody(message, code), { status });
}

export function mobileRateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    errorBody("Too many requests. Please retry shortly.", "RATE_LIMITED"),
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

const BEARER_PATTERN = /^Bearer[ ]+(\S+)$/;
/** ChainReact machine-token prefixes that must never reach Supabase Auth. */
const FOREIGN_TOKEN_PREFIXES = ["crk_", "crmcp_"];

export interface MobileAuthedUser {
  userId: string;
  email: string | null;
  /** Normalized optional device id (rate-limit dimension only). */
  deviceId: string | null;
}

export type MobileGateResult =
  | { ok: true; user: MobileAuthedUser }
  | { ok: false; response: NextResponse };

/**
 * Flag → bearer shape → server-side verification → per-user rate limit.
 * 401s are stable and echo nothing about the token or the failure internals.
 */
export async function requireMobileUser(
  request: NextRequest,
): Promise<MobileGateResult> {
  if (!isMobileApiEnabled()) {
    return { ok: false, response: mobileNamespaceDisabledResponse() };
  }

  const header = request.headers.get("authorization");
  const unauthenticated = () => ({
    ok: false as const,
    response: mobileErrorResponse(401, "UNAUTHENTICATED", "Unauthenticated."),
  });

  // Multiple Authorization headers arrive comma-joined per the Fetch spec —
  // a comma can never appear in a valid single bearer value, so reject.
  if (header === null || header.includes(",")) return unauthenticated();
  const match = BEARER_PATTERN.exec(header.trim());
  if (!match || match[1] === undefined) return unauthenticated();
  const token = match[1];
  if (FOREIGN_TOKEN_PREFIXES.some((p) => token.startsWith(p))) {
    return unauthenticated();
  }

  const supabase = getServiceRoleClient("mobile v1: bearer verification");
  let userId: string;
  let email: string | null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return unauthenticated();
    userId = data.user.id;
    email = data.user.email ?? null;
  } catch {
    return unauthenticated();
  }

  const deviceId = normalizeMobileDeviceId(
    request.headers.get("x-chainreact-device"),
  );
  const limit = await rateLimitMobileUser({ userId, deviceId });
  if (!limit.allowed) {
    return {
      ok: false,
      response: mobileRateLimitedResponse(limit.retryAfterSeconds ?? 60),
    };
  }

  return { ok: true, user: { userId, email, deviceId } };
}

/** Public (pre-auth) gate for app-config: flag + per-IP rate limit only. */
export async function requireMobilePublic(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!isMobileApiEnabled()) {
    return { ok: false, response: mobileNamespaceDisabledResponse() };
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const limit = await rateLimitMobilePublic({ ip });
  if (!limit.allowed) {
    return {
      ok: false,
      response: mobileRateLimitedResponse(limit.retryAfterSeconds ?? 60),
    };
  }
  return { ok: true };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MobileAccountContext {
  accountId: string;
  role: MembershipRole;
}

export type MobileAccountResult =
  | { ok: true; account: MobileAccountContext }
  | { ok: false; response: NextResponse };

/**
 * Explicit account authorization for `{accountId}` path params. Membership by
 * the VERIFIED user; frozen accounts → 403; malformed ids, non-members, and
 * nonexistent accounts all collapse to the same 404. Never consults or
 * mutates the web active-account pointer; never substitutes personal.
 */
export async function requireMobileAccountMember(
  userId: string,
  accountId: string,
): Promise<MobileAccountResult> {
  if (!UUID_PATTERN.test(accountId)) {
    return { ok: false, response: mobileNotFoundResponse() };
  }
  const role = await getRoleServiceRole(accountId, userId);
  if (role === null) {
    return { ok: false, response: mobileNotFoundResponse() };
  }
  const [account] = await listByIdsServiceRole([accountId]);
  if (!account) {
    return { ok: false, response: mobileNotFoundResponse() };
  }
  if (account.deletionStatus !== "active") {
    return {
      ok: false,
      response: mobileErrorResponse(
        403,
        "ACCOUNT_PENDING_DELETION",
        "This account is pending deletion.",
      ),
    };
  }
  return { ok: true, account: { accountId, role } };
}

/**
 * Egress boundary: EVERY successful mobile response is schema-parsed before
 * send. A mismatch never reaches the caller — it logs a REDACTED diagnostic
 * (route + issue paths, no values) and returns a stable 500.
 */
export function sendMobileJson<S extends z.ZodTypeAny>(
  schema: S,
  payload: z.infer<S>,
  init?: { headers?: Record<string, string> },
): NextResponse {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error("[mobile.v1] egress schema mismatch", {
      issues: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 10),
    });
    return mobileErrorResponse(500, "SERVER_ERROR", "Internal error.");
  }
  return NextResponse.json(parsed.data, { status: 200, headers: init?.headers });
}
