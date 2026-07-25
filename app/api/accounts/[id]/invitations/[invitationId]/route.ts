import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  revokeInvitation,
  changeInvitationRole,
  replaceInvitationEmail,
} from "@/services/accounts/invitations";
import { getDisplayName } from "@/repositories/userProfiles";

/**
 * /api/accounts/[id]/invitations/[invitationId] (4.ACCOUNT-MODEL-15, D2a;
 * lifecycle TEAM-INVITATION-LIFECYCLE-2). Owner/admin only; the invitation is
 * scoped to the account in the path, so a caller cannot touch another
 * account's invite.
 *
 *   DELETE — cancel (revoke) a pending invite. Its link stops working.
 *   PATCH  — exactly ONE of:
 *     { role }  — change the pending invite's role IN PLACE. Same id/email/
 *                 token/link; no new email is sent.
 *     { email } — REPLACE the invite: the old one is revoked (link dies) and a
 *                 new invitation + token + email goes to the new address with
 *                 the same role. Returns the new one-time accept link.
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

const PatchInviteBodySchema = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    email: z.string().trim().email("A valid email is required.").optional(),
  })
  .refine((b) => (b.role !== undefined) !== (b.email !== undefined), {
    message: "Provide exactly one of role or email.",
  });

function inviteProjection(inv: {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}) {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  };
}

export async function PATCH(
  request: Request,
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

  const body = await parseAccountBody(request, PatchInviteBodySchema);
  if (!body.ok) return body.response;

  // ── role change: in place, same link, no email ──
  if (body.data.role !== undefined) {
    const result = await changeInvitationRole({
      accountId,
      invitationId,
      role: body.data.role,
    });
    if (!result.ok) {
      return result.reason === "not_found"
        ? NextResponse.json(
            { error: "Invitation not found.", code: "INVITATION_NOT_FOUND" },
            { status: 404 },
          )
        : NextResponse.json(
            { error: "Invitation is not pending.", code: "INVITATION_NOT_PENDING" },
            { status: 409 },
          );
    }
    return NextResponse.json({ ok: true, invitation: inviteProjection(result.invitation) });
  }

  // ── email change: replace (revoke old, new token + email to new address) ──
  let inviterDisplayName: string | null = null;
  try {
    inviterDisplayName = await getDisplayName(auth.userId);
  } catch {
    inviterDisplayName = null;
  }

  const result = await replaceInvitationEmail({
    accountId,
    invitationId,
    newEmail: body.data.email as string,
    inviterUserId: auth.userId,
    inviter: { email: auth.email, displayName: inviterDisplayName },
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return NextResponse.json(
          { error: "Invitation not found.", code: "INVITATION_NOT_FOUND" },
          { status: 404 },
        );
      case "not_pending":
        return NextResponse.json(
          { error: "Invitation is not pending.", code: "INVITATION_NOT_PENDING" },
          { status: 409 },
        );
      case "same_email":
        return NextResponse.json(
          {
            error: "That is already the invited email address.",
            code: "INVITATION_SAME_EMAIL",
          },
          { status: 400 },
        );
      case "account_frozen":
        return NextResponse.json(
          { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
          { status: 403 },
        );
      case "already_member":
        return NextResponse.json(
          { error: "That person is already a member of this account.", code: "ALREADY_MEMBER" },
          { status: 409 },
        );
      case "duplicate_pending":
        return NextResponse.json(
          { error: "A pending invite already exists for that email.", code: "DUPLICATE_PENDING_INVITE" },
          { status: 409 },
        );
      case "team_member_limit_reached":
        return NextResponse.json(
          {
            error:
              "This account is at its member limit. Teams allow up to 5 members and Business up to 25.",
            code: "TEAM_MEMBER_LIMIT_REACHED",
          },
          { status: 409 },
        );
      case "rate_limited":
        return NextResponse.json(
          {
            error: "Too many invitations sent recently. Wait a bit before inviting more people.",
            code: "INVITE_RATE_LIMITED",
          },
          { status: 429 },
        );
      case "owner_not_invitable":
        return NextResponse.json(
          { error: "Owner is not an invitable role.", code: "OWNER_NOT_INVITABLE" },
          { status: 400 },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    invitation: inviteProjection(result.invitation),
    // New one-time link for the NEW address — same exposure contract as create.
    acceptToken: result.acceptToken,
    acceptPath: result.acceptPath,
    emailDelivery: { status: result.emailDelivery.status },
  });
}
