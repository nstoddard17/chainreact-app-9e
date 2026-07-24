import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuthedUserId,
  parseAccountBody,
} from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { verifyPasswordReauth } from "@/services/accounts/accountDeletionReauth";
import {
  transferOwnership,
  type TransferOwnershipReason,
} from "@/services/accounts/transferOwnership";

/**
 * POST /api/accounts/[id]/transfer-ownership
 * (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-3 / TL-2).
 *
 * Owner-initiated ownership transfer. The current owner hands the account to an
 * existing member: the target becomes `owner`, the caller becomes `admin`, and
 * `accounts.owner_user_id` moves to the target — atomically, via the TL-1 RPC.
 * No credential is disconnected and no workflow creator changes (the
 * "transfer and leave" offboarding variant is TL-3, not here).
 *
 * Gate order: authenticated → owner-only role gate → body → step-up re-auth →
 * service. Step-up reuses the account-deletion password re-auth: like deletion,
 * a passwordless (OAuth-only) caller cannot complete it until SSO step-up lands
 * (documented in the slice report); `verifyPasswordReauth` returns `no_email` /
 * `invalid_credentials` and the route answers 401 REAUTH_FAILED.
 */
const TransferOwnershipBodySchema = z.object({
  targetUserId: z.string().uuid("A valid target user id is required."),
  password: z.string().min(1, "Password is required to confirm the transfer."),
});

function ownerGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Only the account owner can transfer ownership.", code: "NOT_OWNER" },
    { status: 403 },
  );
}

function transferFailure(reason: TransferOwnershipReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return NextResponse.json(
        { error: "Account not found.", code: "ACCOUNT_NOT_FOUND" },
        { status: 404 },
      );
    case "personal_account":
      return NextResponse.json(
        { error: "Personal accounts cannot be transferred.", code: "PERSONAL_ACCOUNT_UNSUPPORTED" },
        { status: 400 },
      );
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "not_owner":
      return NextResponse.json(
        { error: "Only the account owner can transfer ownership.", code: "NOT_OWNER" },
        { status: 403 },
      );
    case "target_not_member":
      return NextResponse.json(
        { error: "The new owner must already be a member of this account.", code: "TARGET_NOT_MEMBER" },
        { status: 404 },
      );
    case "target_is_owner":
      return NextResponse.json(
        { error: "That member is already the owner.", code: "TARGET_ALREADY_OWNER" },
        { status: 400 },
      );
    case "target_unavailable":
      // ACCOUNT-BILLING-LIFECYCLE-3. Actionable for the initiating owner ("pick someone
      // else") WITHOUT disclosing another user's private account lifecycle — the caller is
      // told the recipient is unavailable, not that they are deleting their account.
      return NextResponse.json(
        {
          error:
            "That member can't become the owner right now because their ChainReact account is unavailable. Choose a different member.",
          code: "TARGET_UNAVAILABLE",
        },
        { status: 409 },
      );
    case "transfer_failed":
      return NextResponse.json(
        { error: "Couldn't transfer ownership. Please try again.", code: "TRANSFER_FAILED" },
        { status: 500 },
      );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const body = await parseAccountBody(request, TransferOwnershipBodySchema);
  if (!body.ok) return body.response;

  // Owner-only: admins and members are refused (NOT_OWNER).
  const role = await requireAccountRole(auth.userId, accountId, ["owner"]);
  if (!role.ok) return ownerGateFailure(role.reason);

  // Step-up re-auth — a high-impact, hard-to-reverse action.
  const reauth = await verifyPasswordReauth(auth.email, body.data.password);
  if (!reauth.ok) {
    return NextResponse.json(
      { error: "Password confirmation failed.", code: "REAUTH_FAILED" },
      { status: 401 },
    );
  }

  const result = await transferOwnership({
    accountId,
    callerUserId: auth.userId,
    targetUserId: body.data.targetUserId,
  });
  if (!result.ok) return transferFailure(result.reason);

  // Safe summary only — no emails / member graph.
  return NextResponse.json({
    ok: true,
    account: {
      id: result.account.id,
      name: result.account.name,
      type: result.account.type,
      ownerUserId: result.account.ownerUserId,
    },
    transfer: {
      previousOwnerUserId: result.previousOwnerUserId,
      previousOwnerRole: "admin",
      newOwnerUserId: result.newOwnerUserId,
      newOwnerRole: "owner",
    },
  });
}
