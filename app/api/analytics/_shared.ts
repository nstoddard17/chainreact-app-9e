import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { isMember } from "@/repositories/accountMemberships";
import { getDashboardAccount } from "@/services/analytics/dashboards";

/**
 * Shared route-layer helpers for /api/analytics (Slice ANALYTICS-1).
 *
 * Underscore-prefixed: not a route. Importable from sibling route.ts files only.
 * Owns the auth/account gate so each route stays thin (validate → service →
 * serialize).
 */

export interface AccountSuccess {
  ok: true;
  userId: string;
  accountId: string;
}
export interface RouteFailure {
  ok: false;
  response: NextResponse;
}

/**
 * Resolve the authenticated caller + their ACTIVE account (the analytics scope).
 * Mirrors `requireUserWithAccount`: 401 anon, 403 on a frozen / non-member
 * explicit account. No explicit-account input is accepted here — the scope is
 * always the caller's own active account.
 */
export async function requireAccount(): Promise<AccountSuccess | RouteFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  const resolved = await resolveActiveAccount(user.id);
  if (!resolved.ok) {
    const code =
      resolved.reason === "account_frozen"
        ? "ACCOUNT_PENDING_DELETION"
        : "NOT_ACCOUNT_MEMBER";
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This account is not available.", code },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: user.id, accountId: resolved.accountId };
}

/**
 * Standard "dashboard not found" — a missing dashboard AND a dashboard in an
 * account the caller is not a member of BOTH collapse to this 404 (no existence
 * leak), mirroring the workflow TW-1 shape.
 */
export function dashboardNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Dashboard not found.", code: "DASHBOARD_NOT_FOUND" },
    { status: 404 },
  );
}

/**
 * Authorize a write to dashboard `id`: the caller must be a member of the
 * dashboard's owning account. Membership-based (not active-account-based) so a
 * member managing a dashboard while a different account is active still works.
 * Non-member / missing → 404 (no leak). Returns the owning account id on success.
 */
export async function authorizeDashboardWrite(
  userId: string,
  id: string,
): Promise<{ ok: true; accountId: string } | RouteFailure> {
  const owner = await getDashboardAccount(id);
  if (!owner) return { ok: false, response: dashboardNotFoundResponse() };
  const member = await isMember(userId, owner.accountId);
  if (!member) return { ok: false, response: dashboardNotFoundResponse() };
  return { ok: true, accountId: owner.accountId };
}

/** Parse a JSON body with a Zod schema; 400 on failure. Returns the schema's
 * OUTPUT type (defaults applied), so callers see fully-resolved fields. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | RouteFailure> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request body.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
