import { NextResponse } from "next/server";
import { z } from "zod";
import type { MembershipRole } from "@/contracts/accounts";
import { ANALYTICS_CANONICAL_COLUMNS, type AnalyticsWidget } from "@/contracts/analytics";
import { validateLayout } from "@/features/analytics/layout/validateLayout";
import { createClient } from "@/utils/supabase/server";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { getDashboardAccount } from "@/services/analytics/dashboards";

/**
 * Roles allowed to AUTHOR (create / rename / delete / edit-layout) dashboards.
 * Analytics dashboards are account-wide shared objects, so mutation is gated to
 * owner/admin for shared accounts. A PERSONAL account's owner has role `owner`,
 * so personal users keep full self-serve authoring with no special-casing.
 * READS stay membership-authorized (any member) — viewing is not gated here.
 */
const DASHBOARD_AUTHOR_ROLES: readonly MembershipRole[] = ["owner", "admin"];

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

/** Standard 403 when a member lacks the owner/admin role to author dashboards. */
export function dashboardAuthorForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Only account owners and admins can manage dashboards.",
      code: "FORBIDDEN_DASHBOARD_AUTHOR",
    },
    { status: 403 },
  );
}

/**
 * Authorize the caller to AUTHOR dashboards in `accountId` (owner/admin; a
 * personal owner qualifies). Non-member → 404 (no existence leak); member without
 * the role → 403. Used by the create route on the active account.
 */
export async function requireDashboardAuthor(
  userId: string,
  accountId: string,
): Promise<{ ok: true } | RouteFailure> {
  const role = await requireAccountRole(userId, accountId, DASHBOARD_AUTHOR_ROLES);
  if (role.ok) return { ok: true };
  return role.reason === "not_member"
    ? { ok: false, response: dashboardNotFoundResponse() }
    : { ok: false, response: dashboardAuthorForbiddenResponse() };
}

/**
 * Authorize a WRITE to dashboard `id`: the caller must be an owner/admin (author)
 * of the dashboard's owning account. Authoring-role-based, not just membership —
 * analytics dashboards are shared account objects (a plain member may read but
 * not mutate them). A missing dashboard OR a non-member both collapse to 404 (no
 * existence leak); a member who lacks the role gets 403. Returns the owning
 * account id on success.
 */
export async function authorizeDashboardWrite(
  userId: string,
  id: string,
): Promise<{ ok: true; accountId: string } | RouteFailure> {
  const owner = await getDashboardAccount(id);
  if (!owner) return { ok: false, response: dashboardNotFoundResponse() };
  const authored = await requireDashboardAuthor(userId, owner.accountId);
  if (!authored.ok) return authored;
  return { ok: true, accountId: owner.accountId };
}

/**
 * Board-level layout check for a write (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1).
 *
 * Zod validates one widget at a time and cannot see the SET: two individually
 * legal rectangles can still sit on top of each other. When a submitted board
 * carries explicit placement, this is the server's last line before it is
 * stored — without it a client could persist an overlapping board that the read
 * path would then have to repair on every load.
 *
 * A board with NO placement (every legacy board, and every board this release's
 * UI produces) passes untouched: nothing here pushes a save toward explicit
 * layout. A partially-placed board is refused rather than stored, because that
 * transitional state is never valid.
 *
 * Returns `null` when the board is acceptable, or a 400 to return as-is.
 */
export function rejectInvalidWidgetLayout(
  widgets: readonly AnalyticsWidget[] | undefined,
): NextResponse | null {
  if (!widgets || widgets.length === 0) return null;
  const placed = widgets.filter((w) => w.layout);
  if (placed.length === 0) return null;
  if (placed.length < widgets.length) {
    return NextResponse.json(
      {
        error:
          "Every widget must carry a placement, or none may. A partly-placed dashboard cannot be saved.",
      },
      { status: 400 },
    );
  }
  const validation = validateLayout(
    widgets.map((w) => ({ widgetId: w.id, x: w.layout!.x, y: w.layout!.y, w: w.layout!.w, h: w.layout!.h })),
    ANALYTICS_CANONICAL_COLUMNS,
  );
  if (validation.ok) return null;
  return NextResponse.json(
    {
      error: "The dashboard layout is not valid.",
      issues: validation.problems.map((p) => ({ code: p.code, widgetIds: p.widgetIds })),
    },
    { status: 400 },
  );
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
