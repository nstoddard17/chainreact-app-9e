import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { revokeInvitation } from "@/services/accounts/invitations";

/**
 * DELETE /api/accounts/[id]/invitations/[invitationId] — revoke a pending invite
 * (4.ACCOUNT-MODEL-15, D2a). Owner/admin only. The invitation is scoped to the
 * account in the path, so a caller cannot revoke another account's invite.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, invitationId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) {
    return NextResponse.json(
      role.reason === "not_member"
        ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
        : { error: "Insufficient permissions.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const result = await revokeInvitation({ accountId, invitationId });
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: "Invitation not found.", code: "INVITATION_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Invitation is not pending.", code: "INVITATION_NOT_PENDING" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
