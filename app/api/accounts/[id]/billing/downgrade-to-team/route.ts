import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isBusinessDowngradeEnabled } from "@/services/billing/billingFeatureFlags";
import {
  downgradeBusinessToTeam,
  type BusinessDowngradeReason,
} from "@/services/billing/businessDowngrade";

/**
 * POST /api/accounts/[id]/billing/downgrade-to-team (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-5
 * / CS-BD-3).
 *
 * The explicit, owner-confirmed entry point for the DESTRUCTIVE Business → Team downgrade. It is
 * NOT webhook-driven (the webhook never destroys data). Gates, in order:
 *   1. ENABLE_BUSINESS_DOWNGRADE OFF → 404 (the surface is dark; no oracle it exists);
 *   2. auth → 401;
 *   3. OWNER-only on the target account → 403 (admins/members/non-members cannot trigger);
 *   4. service: organization-only + not-frozen + idempotent → typed reason → HTTP.
 *
 * Delegates entirely to the CS-BD-1 `downgradeBusinessToTeam` orchestration (which re-validates
 * owner + organization + not-frozen, removes non-owner members via the existing offboarding,
 * flattens folders to Trash, keeps workflows, and atomically flips type/plan). Returns ONLY safe
 * counts — no Stripe ids, no workflow/export payload, no offboarding detail.
 */

function notFound(): NextResponse {
  // Flag-off mirrors the platform-billing routes: identical 404 whether or not the feature/account
  // exists — no existence oracle.
  return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
}

function downgradeFailure(reason: BusinessDowngradeReason): NextResponse {
  switch (reason) {
    case "disabled":
      // Defensive — the route already 404s when the flag is off.
      return notFound();
    case "account_not_found":
      return notFound();
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "not_owner":
      return NextResponse.json(
        { error: "Only the account owner can downgrade.", code: "FORBIDDEN" },
        { status: 403 },
      );
    case "not_business":
      return NextResponse.json(
        { error: "This account is not a Business account.", code: "NOT_BUSINESS_ACCOUNT" },
        { status: 400 },
      );
    case "offboarding_failed":
    case "folder_flatten_failed":
    case "flip_failed":
      // Generic — never leak which step failed beyond a safe retryable error.
      return NextResponse.json(
        { error: "Could not complete the downgrade. Please try again.", code: "DOWNGRADE_FAILED" },
        { status: 500 },
      );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isBusinessDowngradeEnabled()) return notFound();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  // Owner-only at the route (the service re-validates too). Admins/members/non-members → 403.
  const role = await requireAccountRole(auth.userId, accountId, ["owner"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : { error: "Only the account owner can downgrade.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  let result;
  try {
    result = await downgradeBusinessToTeam({ accountId, actorUserId: auth.userId });
  } catch {
    return NextResponse.json(
      { error: "Could not complete the downgrade. Please try again.", code: "DOWNGRADE_FAILED" },
      { status: 500 },
    );
  }

  if (!result.ok) return downgradeFailure(result.reason);
  return NextResponse.json({
    ok: true,
    alreadyTeam: result.alreadyTeam,
    removedMembers: result.removedMembers,
    flattenedFolders: result.flattenedFolders,
  });
}
