import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthedUserId,
  parseAccountBody,
} from "@/app/api/account/_shared";
import { acceptInvitation } from "@/services/accounts/invitations";

/**
 * POST /api/invitations/accept — accept a team invite by token
 * (4.ACCOUNT-MODEL-15, D2a).
 *
 * Authenticated. The accepting user's SESSION email must match the invite email
 * (an invite is bound to an identity without pre-creating the user — sign-up-
 * then-accept works because the token rides in the URL across signup). On
 * success the membership is created with the invite's role and the joined
 * account auto-activates.
 */
const AcceptBodySchema = z.object({
  token: z.string().min(1, "An invite token is required."),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, AcceptBodySchema);
  if (!body.ok) return body.response;

  const result = await acceptInvitation({
    token: body.data.token,
    userId: auth.userId,
    userEmail: auth.email,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return NextResponse.json(
          { error: "Invite not found.", code: "INVITATION_NOT_FOUND" },
          { status: 404 },
        );
      case "expired":
        return NextResponse.json(
          { error: "This invite has expired.", code: "INVITATION_EXPIRED" },
          { status: 410 },
        );
      case "revoked":
        return NextResponse.json(
          { error: "This invite was revoked.", code: "INVITATION_REVOKED" },
          { status: 410 },
        );
      case "already_accepted":
        return NextResponse.json(
          { error: "This invite has already been used.", code: "INVITATION_ALREADY_ACCEPTED" },
          { status: 409 },
        );
      case "wrong_email":
        return NextResponse.json(
          {
            error: "This invite was sent to a different email address.",
            code: "INVITATION_EMAIL_MISMATCH",
          },
          { status: 403 },
        );
      case "account_frozen":
        return NextResponse.json(
          { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
          { status: 403 },
        );
      case "team_member_limit_reached":
        return NextResponse.json(
          {
            error:
              "This team is full (5-member limit). Organization accounts support larger teams (coming soon).",
            code: "TEAM_MEMBER_LIMIT_REACHED",
          },
          { status: 409 },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    account: result.account,
    alreadyMember: result.alreadyMember,
  });
}
