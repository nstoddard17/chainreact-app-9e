import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { listIncomingCredentialRequests } from "@/services/teamCredentials/credentialRequestsInbox";

/**
 * GET /api/accounts/[id]/credential-requests
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-8 / CS-7)
 *
 * The CALLER's own pending per-node credential-reassignment requests in this
 * account — the consent inbox the Team page surfaces so a target member can
 * accept / decline (accept/decline go through the existing CS-3 workflow routes).
 *
 * Self-scoped + membership-gated: the count/list is always the caller's own
 * (`auth.userId` from the verified session, never request input), so it can't be
 * used to probe another member. Any account member may read their own inbox
 * (a target is often a plain member). Returns only the no-leak
 * `CredentialRequestView[]` — never a token, provider account label, or email.
 *
 * Feature OFF → the service returns `[]` (safe empty state, no oracle).
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

  const requests = await listIncomingCredentialRequests({ accountId, userId: auth.userId });
  return NextResponse.json({ requests });
}
