import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthedUserId,
  parseAccountBody,
} from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  createInvitation,
  listInvitations,
} from "@/services/accounts/invitations";
import { getDisplayName } from "@/repositories/userProfiles";

/**
 * /api/accounts/[id]/invitations (4.ACCOUNT-MODEL-15, D2a; email delivery
 * TEAM-INVITATION-EMAIL-1).
 *   POST — create an invite (owner/admin). Body { email, role: 'admin'|'member' }.
 *   GET  — list pending invites (owner/admin).
 *
 * The inviter is the session user; the account id is the path segment; the role
 * is checked via `requireAccountRole`. 'owner' is not invitable (the role enum
 * excludes it). The raw accept token is returned ONLY on create. Creation also
 * attempts a transactional email to the invited address; delivery outcome comes
 * back as `emailDelivery.status` and NEVER turns a persisted invitation into an
 * error response (a 5xx here would push the UI into a retry that trips the
 * duplicate-pending rule).
 */

const CreateInviteBodySchema = z.object({
  email: z.string().trim().email("A valid email is required."),
  role: z.enum(["admin", "member"]),
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

function roleFailureResponse(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleFailureResponse(role.reason);

  const body = await parseAccountBody(request, CreateInviteBodySchema);
  if (!body.ok) return body.response;

  // Safe inviter identity for the email body: session email + the caller's OWN
  // profile display name (session-client read, RLS-gated to auth.uid()).
  // Best-effort — a profile read failure must not block the invite.
  let inviterDisplayName: string | null = null;
  try {
    inviterDisplayName = await getDisplayName(auth.userId);
  } catch {
    inviterDisplayName = null;
  }

  const result = await createInvitation({
    accountId,
    inviterUserId: auth.userId,
    email: body.data.email,
    role: body.data.role,
    inviter: { email: auth.email, displayName: inviterDisplayName },
  });

  if (!result.ok) {
    switch (result.reason) {
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
      case "owner_not_invitable":
        return NextResponse.json(
          { error: "Owner is not an invitable role.", code: "OWNER_NOT_INVITABLE" },
          { status: 400 },
        );
      case "rate_limited":
        return NextResponse.json(
          {
            error:
              "Too many invitations sent recently. Wait a bit before inviting more people.",
            code: "INVITE_RATE_LIMITED",
          },
          { status: 429 },
        );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      invitation: inviteProjection(result.invitation),
      // Raw token / accept link — available ONLY here (never stored).
      acceptToken: result.acceptToken,
      acceptPath: result.acceptPath,
      // Delivery outcome only — never provider internals or message ids.
      emailDelivery: { status: result.emailDelivery.status },
    },
    { status: 201 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleFailureResponse(role.reason);

  const invites = await listInvitations(accountId);
  return NextResponse.json({ invitations: invites.map(inviteProjection) });
}
