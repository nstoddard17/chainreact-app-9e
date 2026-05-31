import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  SetActiveAccountBodySchema,
} from "@/app/api/account/_shared";
import { setActiveAccount } from "@/services/accounts/activeAccount";

/**
 * POST /api/account/active — set the caller's durable active account
 * (4.ACCOUNT-MODEL-11d).
 *
 * Writes `user_profiles.active_account_id` ONLY after the same membership +
 * freeze gate the resolver uses passes. Backend-only: NO visible switcher UI
 * ships in this slice; this is the endpoint a Phase D switcher will call.
 *
 * Guards:
 *   - Authenticated session → the user id comes from the session, NEVER the body,
 *     so a caller can only set THEIR OWN active account.
 *   - Body carries the target `accountId` (uuid) — malformed/missing → 400.
 *   - Membership-verified: non-member target → 403 NOT_ACCOUNT_MEMBER.
 *   - Freeze-checked: pending_deletion target → 403 ACCOUNT_PENDING_DELETION.
 *
 * Setting the active account grants NO access — it is a UI default; authority is
 * re-checked at every resolve. On any failure the previous `active_account_id`
 * is left untouched (the service never writes before the gate passes).
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, SetActiveAccountBodySchema);
  if (!body.ok) return body.response;

  const result = await setActiveAccount(auth.userId, body.data.accountId);
  if (!result.ok) {
    if (result.reason === "account_frozen") {
      return NextResponse.json(
        {
          error: "This account is pending deletion.",
          code: "ACCOUNT_PENDING_DELETION",
        },
        { status: 403 },
      );
    }
    // not_member — the caller does not belong to the target account.
    return NextResponse.json(
      {
        error: "You are not a member of this account.",
        code: "NOT_ACCOUNT_MEMBER",
      },
      { status: 403 },
    );
  }

  console.info(
    JSON.stringify({ event: "account.active.set", source: "set_active_endpoint" }),
  );

  return NextResponse.json({
    ok: true,
    activeAccountId: result.account.id,
    account: {
      id: result.account.id,
      name: result.account.name,
      type: result.account.type,
    },
  });
}
