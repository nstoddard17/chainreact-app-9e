import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { countImpactedWorkflowsForMember } from "@/services/accounts/offboardingImpact";

/**
 * GET /api/accounts/[id]/leave-impact (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-4 / TL-3).
 *
 * Self-scoped advisory count for the leave confirmation: how many workflows the
 * CALLER created in this account use a personal-provider step (those may stop
 * running after leaving soft-disconnects their personal Team credentials).
 * Membership-gated and self-only — the count is always the caller's own
 * (`auth.userId` from the verified session, never request input), so it can't be
 * used to probe another member. Returns only a count, never workflow details.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : { error: "Insufficient permissions.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const affectedWorkflowCount = await countImpactedWorkflowsForMember(accountId, auth.userId);
  return NextResponse.json({ affectedWorkflowCount });
}
