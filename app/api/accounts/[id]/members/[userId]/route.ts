import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthedUserId,
  parseAccountBody,
} from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { removeMember, changeMemberRole } from "@/services/accounts/membership";
import type { MemberMgmtReason } from "@/services/accounts/membership";

/**
 * /api/accounts/[id]/members/[userId] (4.ACCOUNT-MODEL-16, D2b).
 *   DELETE — remove a non-owner member (owner/admin).
 *   PATCH  — change a non-owner member's role admin↔member (owner/admin).
 *
 * The coarse gate (owner/admin) is `requireAccountRole`; the service enforces the
 * fine-grained rules (owner is never a target; admin manages members only; no
 * owner role changes; frozen accounts refuse). The caller's role is threaded to
 * the service so it can apply admin-manages-members-only.
 */

const ChangeRoleBodySchema = z.object({
  role: z.enum(["admin", "member"]),
});

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

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, userId: targetUserId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await removeMember({ accountId, targetUserId, actingRole: role.role });
  if (!result.ok) return memberMgmtFailure(result.reason);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, userId: targetUserId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, ChangeRoleBodySchema);
  if (!body.ok) return body.response;

  const result = await changeMemberRole({
    accountId,
    targetUserId,
    newRole: body.data.role,
    actingRole: role.role,
  });
  if (!result.ok) return memberMgmtFailure(result.reason);
  return NextResponse.json({ ok: true, role: body.data.role });
}
