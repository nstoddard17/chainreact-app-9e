import { NextResponse } from "next/server";
import {
  requireOwnPersonalAccount,
  toDeletionStatusResponse,
} from "@/app/api/account/_shared";
import { requestAccountDeletion } from "@/services/accounts/accountDeletion";

/**
 * POST /api/account/delete/retry-billing — re-attempt ONLY the subscription
 * cancellation after a partial deletion failure
 * (ACCOUNT-BILLING-LIFECYCLE-1; extracted in ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * WHY THIS EXISTS AS ITS OWN ROUTE. The billing retry used to re-POST
 * `/api/account/delete` with the user's password. With the password step-up gone,
 * re-posting that route would demand a fresh emailed verification code to recover
 * from OUR failure — friction with no security value, because there is no
 * destructive transition left to authorize: the account is ALREADY
 * `pending_deletion`, and `requestAccountDeletion`'s already-pending branch
 * performs no lifecycle write. It only re-runs the idempotent Stripe cancellation.
 *
 * Guards: authenticated caller + their OWN personal account + the account must
 * already be `pending_deletion`. An `active` account is refused, so this route can
 * never become a second, unverified way to start a deletion.
 *
 * POST-only, no GET export. No password, no code, no provider branch.
 */
export async function POST(): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  if (auth.account.deletionStatus !== "pending_deletion") {
    // Refuse rather than silently starting a deletion: this route exists only to
    // finish a wind-down that already began.
    return NextResponse.json(
      {
        error: "This account isn't scheduled for deletion.",
        code: "NOT_PENDING_DELETION",
      },
      { status: 409 },
    );
  }

  // Already-pending path: no freeze, no audit row, no ownership transition — just
  // the idempotent cancellation retry.
  const state = await requestAccountDeletion({
    accountId: auth.account.id,
    requestedByUserId: auth.userId,
  });
  const billing = state.billingCancellation;

  console.info(
    JSON.stringify({
      event: "account.delete.billing_retry",
      billingCancellation: billing?.status ?? "not_applicable",
    }),
  );

  if (billing?.status === "failed") {
    return NextResponse.json(
      {
        ...toDeletionStatusResponse(state),
        billingCancellation: "failed",
        error:
          "We still couldn't cancel your subscription. Try again shortly — your account will not be permanently deleted while a subscription is still active.",
        code: "BILLING_CANCELLATION_FAILED",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ...toDeletionStatusResponse(state),
    billingCancellation: billing?.status ?? "not_applicable",
  });
}
