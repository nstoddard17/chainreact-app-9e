import { NextResponse } from "next/server";
import { requireUserWithAccount } from "@/app/api/workflows/_shared";
import { getCollaborationChecklist } from "@/services/collaborationOnboarding/checklistState";

/**
 * GET /api/onboarding/collaboration — the derived, ROLE-SPECIFIC collaboration
 * checklist for the caller's ACTIVE account (5.ONBOARD-4).
 *
 * Gate order: auth + active-account resolution (`requireUserWithAccount` —
 * membership re-verified, frozen accounts 403) → the service re-reads the
 * caller's role from `account_memberships` → derivation.
 *
 * THE ROUTE ACCEPTS NO INPUT AT ALL. No account id, no role, no track, no query
 * params. Which checklist you get is a pure function of who your session says you
 * are and what the database says your role is — so there is no request a member
 * can craft to obtain the owner checklist, and no owner-only action reachable
 * through this surface (it is a read; every CTA on the card is a plain link).
 *
 * Returns `null` (200) when the account is not eligible — personal accounts, and
 * shared accounts whose authoritative plan is not a collaboration tier. `null` is
 * the honest answer, not a 403: not being on a Team plan is not an authorization
 * failure, and the client simply renders no collaboration card.
 *
 * Derivation errors are a safe 500 — the dashboard omits the card rather than
 * breaking.
 */
export async function GET(): Promise<Response> {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  try {
    const dto = await getCollaborationChecklist({
      userId: auth.userId,
      accountId: auth.accountId,
    });
    return NextResponse.json(dto);
  } catch (err) {
    console.error(
      "[collab-onboarding] checklist derivation failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "ONBOARDING_UNAVAILABLE" },
      { status: 500 },
    );
  }
}
