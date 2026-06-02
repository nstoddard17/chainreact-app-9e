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
    // Identity (email/displayName) is co-member-only — this route already gated
    // on membership above, and the underlying RPC re-checks it (4.TEAM-PAGE-2).
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      invitedByUserId: m.invitedByUserId,
      email: m.email,
      displayName: m.displayName,
    })),
  });
}
