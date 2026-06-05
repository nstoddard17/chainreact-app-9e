import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { leaveAccount, type LeaveAccountReason } from "@/services/accounts/leaveAccount";

/**
 * POST /api/accounts/[id]/leave (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-4 / TL-3).
 *
 * The caller leaves the account themselves. Any member (owner/admin/member) may
 * hit this; the service refuses a sole owner (SOLE_OWNER_MUST_TRANSFER → must
 * transfer first), a personal account, and a frozen account. Leaving reuses the
 * removal offboarding (personal-credential soft-disconnect + active-pointer
 * clear). No step-up — leaving is low-risk and reversible via re-invite.
 */
function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

function leaveFailure(reason: LeaveAccountReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return NextResponse.json(
        { error: "Account not found.", code: "ACCOUNT_NOT_FOUND" },
        { status: 404 },
      );
    case "personal_account":
      return NextResponse.json(
        { error: "You can't leave your personal account.", code: "CANNOT_LEAVE_PERSONAL" },
        { status: 400 },
      );
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "not_member":
      return NextResponse.json(
        { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" },
        { status: 403 },
      );
    case "sole_owner_must_transfer":
      return NextResponse.json(
        {
          error: "Transfer ownership before leaving — an account must keep an owner.",
          code: "SOLE_OWNER_MUST_TRANSFER",
        },
        { status: 409 },
      );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  // Membership gate (any role); the service applies the sole-owner rule.
  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await leaveAccount({ accountId, userId: auth.userId });
  if (!result.ok) return leaveFailure(result.reason);
  return NextResponse.json({ ok: true });
}
