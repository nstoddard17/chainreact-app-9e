import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { listMembers } from "@/services/accounts/membership";

/**
 * GET /api/accounts/[id]/members — list members of an account
 * (4.ACCOUNT-MODEL-16, D2b). ANY member may read the roster (the broadened
 * co-member RLS scopes the read); a non-member gets 403.
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
      { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
      { status: 403 },
    );
  }

  const members = await listMembers(accountId);
  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      invitedByUserId: m.invitedByUserId,
    })),
  });
}
