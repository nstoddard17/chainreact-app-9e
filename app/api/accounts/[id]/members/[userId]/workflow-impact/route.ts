import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { getMemberWorkflowImpact } from "@/services/accounts/membership";
import type { MemberMgmtReason } from "@/services/accounts/membership";

/**
 * GET /api/accounts/[id]/members/[userId]/workflow-impact
 * (Slice 4.TEAM-WORKFLOWS-7 / TW-5)
 *
 * Advisory, read-only pre-removal check: how many workflows the target member
 * created that contain a personal-provider step (those may stop running after
 * removal soft-disconnects their personal Team credentials — 22C). The member-
 * removal UI fetches this to show a non-blocking warning before confirming.
 *
 * Authorization mirrors DELETE exactly — `requireAccountRole(["owner","admin"])`
 * + the service's fine-grained gate (owner-untouchable, admin-manages-members-
 * only, frozen-account refusal). An unauthorized caller, or one targeting a
 * member they may not remove, gets the gate failure and NEVER the impact count
 * (no workflow detail is exposed — only an integer).
 */

function memberMgmtFailure(reason: MemberMgmtReason): NextResponse {
  switch (reason) {
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "member_not_found":
      return NextResponse.json(
        { error: "That user is not a member of this account.", code: "MEMBER_NOT_FOUND" },
        { status: 404 },
      );
    case "owner_target":
      return NextResponse.json(
        { error: "The account owner cannot be removed or changed here.", code: "OWNER_TARGET" },
        { status: 403 },
      );
    case "forbidden_target":
      return NextResponse.json(
        { error: "Admins can only manage members.", code: "FORBIDDEN_TARGET" },
        { status: 403 },
      );
    case "invalid_role":
      return NextResponse.json(
        { error: "Role must be 'admin' or 'member'.", code: "INVALID_ROLE" },
        { status: 400 },
      );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, userId: targetUserId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : { error: "Insufficient permissions.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const result = await getMemberWorkflowImpact({
    accountId,
    targetUserId,
    actingRole: role.role,
  });
  if (!result.ok) return memberMgmtFailure(result.reason);

  return NextResponse.json({ affectedWorkflowCount: result.affectedWorkflowCount });
}
