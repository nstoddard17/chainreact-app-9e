import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import * as workflowsRepo from "@/repositories/workflows";
import * as accountsRepo from "@/repositories/accounts";
import { buildAccountWorkflowsExport } from "@/services/workflows/exportWorkflow";
import { isBusinessDowngradeEnabled } from "@/services/billing/billingFeatureFlags";
import { resolveAccountCapabilities } from "@/services/billing/planCapabilities";

/**
 * GET /api/accounts/[id]/workflows/export
 * (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-4 / CS-BD-4B; tier-gated in
 * 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-3 / CS-XT-2+3).
 *
 * Returns a CREDENTIAL-FREE JSON snapshot of ALL active (non-deleted) workflows in an account.
 * Two modes:
 *
 *  • **Normal bulk export** (no `purpose`): tier + role gated using the account's ACTUAL stored
 *    plan (CS-XT-1 resolver). Bulk export is owner/admin-only on shared accounts (member → 403
 *    FORBIDDEN), and the plan must permit bulk export (Free → 403 UPGRADE_REQUIRED; Pro/Team/
 *    Business/Enterprise permitted); non-member → 403 NOT_ACCOUNT_MEMBER (no oracle). The
 *    single-workflow export floor (GET /api/workflows/[id]/export) is NEVER gated and is
 *    unchanged — it remains available to every tier and every member.
 *
 *  • **Downgrade safety export** (`?purpose=downgrade`): the owner's "save your work before the
 *    destructive Business → Team downgrade" path. OWNER-only, organization-account-only, gated by
 *    `ENABLE_BUSINESS_DOWNGRADE` (dark → 404 when off, mirroring the downgrade route), and it
 *    BYPASSES the normal bulk-export tier check (a destructive safety flow must never be blocked
 *    by tier policy). It still requires owner auth, is still account-scoped, and uses the SAME
 *    sanitizer + bulk export builder — only the tier gate is skipped.
 *
 * Every workflow runs through the same sanitizer as the single-workflow export — no tokens,
 * secrets, provider account labels/emails, credential-owner ids, integration ids, Stripe ids, or
 * user ids ever appear. `listByAccount` is the RLS client + excludes soft-deleted. Folder
 * hierarchy is omitted (downgrade flattens it). Over the per-export cap → typed 413.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
}

function notAccountMember(): NextResponse {
  return NextResponse.json(
    { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
    { status: 403 },
  );
}

function tooMany(count: number, limit: number): NextResponse {
  return NextResponse.json(
    {
      error: "Too many workflows to export at once. Export workflows individually instead.",
      code: "TOO_MANY_WORKFLOWS",
      count,
      limit,
    },
    { status: 413 },
  );
}

/** Build + serialize the bulk export for an account (shared by both modes — one sanitizer). */
async function bulkExportResponse(accountId: string): Promise<Response> {
  const records = await workflowsRepo.listByAccount(accountId); // excludes soft-deleted
  const built = buildAccountWorkflowsExport(accountId, records, new Date().toISOString());
  if (!built.ok) return tooMany(built.count, built.limit);
  return NextResponse.json(built.export, {
    headers: {
      "Content-Disposition": `attachment; filename="chainreact-workflows-${accountId}.json"`,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;
  const purpose = new URL(request.url).searchParams.get("purpose");

  // ── Downgrade safety export — owner-only, org-only, tier gate BYPASSED ──────────────────────
  if (purpose === "downgrade") {
    // Dark surface when downgrade is disabled — identical 404 whether or not the account exists.
    if (!isBusinessDowngradeEnabled()) return notFound();

    const role = await requireAccountRole(auth.userId, accountId, ["owner"]);
    if (!role.ok) {
      return role.reason === "not_member"
        ? notAccountMember()
        : NextResponse.json(
            { error: "Only the account owner can export for downgrade.", code: "FORBIDDEN" },
            { status: 403 },
          );
    }
    // Organization (Business) accounts only — the downgrade path doesn't exist for personal/team.
    const account = await accountsRepo.getById(accountId);
    if (!account || account.type !== "organization") {
      return NextResponse.json(
        { error: "This account is not a Business account.", code: "NOT_BUSINESS_ACCOUNT" },
        { status: 400 },
      );
    }
    return bulkExportResponse(accountId);
  }

  // ── Normal bulk export — tier + role gated ──────────────────────────────────────────────────
  // Bulk export of a whole (shared) account is an owner/admin action; members keep single-workflow
  // export. A non-member gets NOT_ACCOUNT_MEMBER (no existence oracle); a member without
  // owner/admin gets FORBIDDEN.
  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return role.reason === "not_member"
      ? notAccountMember()
      : NextResponse.json(
          {
            error: "Only owners and admins can export all workflows in this account.",
            code: "FORBIDDEN",
          },
          { status: 403 },
        );
  }

  // Plan must permit bulk export (Free blocked). Uses the account's ACTUAL stored plan; resolver
  // fails closed to Free and returns plan + booleans only — no Stripe ids ever.
  const { capabilities } = await resolveAccountCapabilities(accountId);
  if (!capabilities.canBulkExport) {
    return NextResponse.json(
      {
        error: "Bulk export isn't available on your current plan. Upgrade to export all at once.",
        code: "UPGRADE_REQUIRED",
      },
      { status: 403 },
    );
  }

  return bulkExportResponse(accountId);
}
