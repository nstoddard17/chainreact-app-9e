import { NextResponse } from "next/server";
import {
  requireOwnPersonalAccount,
  requireDeletionStepUpSession,
  parseAccountBody,
  RequestDeletionBodySchema,
  toDeletionStatusResponse,
} from "@/app/api/account/_shared";
import { consumeDeletionAuthorization } from "@/services/accounts/deletionChallenge";
import {
  OwnedAccountsBlockDeletionError,
  requestAccountDeletion,
} from "@/services/accounts/accountDeletion";
import type { OwnedAccountSummary } from "@/repositories/accounts";

/**
 * User-facing label for an owned account type. The internal enum keeps
 * `organization`, but the product term is **Business** — never surface
 * "Organization" as a tier. `team` stays "Team".
 */
function accountTypeLabel(type: OwnedAccountSummary["type"]): string {
  return type === "organization" ? "Business" : "Team";
}

/**
 * POST /api/account/delete — self-serve account-deletion REQUEST
 * (4.ACCOUNT-MODEL-10e; step-up replaced in ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Moves the caller's OWN personal account to `pending_deletion` (frozen,
 * reversible) and stamps the grace deadline + a durable audit row. It does NOT
 * purge — that is the flag-gated `purge-pending-deletions` cron (10c) — so this
 * route only ever soft-freezes and is fully reversible via the sibling cancel
 * route during the grace window.
 *
 * ── Step-up: UNIVERSAL EMAIL CODE, never a password ────────────────────────────
 * This route used to require the caller's ChainReact password. That made the only
 * irreversible action in the product unreachable for anyone who signed up with
 * Google, with an email OTP, or (later) with SSO — those identities may have no
 * password to type. It now requires a verification code that was emailed to the
 * VERIFIED address on the caller's auth identity, verified in THIS session, for
 * the `delete_account` purpose specifically, and not yet spent. There is no
 * password field, no provider branch, and no alternate path: every account type
 * takes the same three steps (send code → verify code → type DELETE).
 *
 * Guards, in order:
 *   1. Authenticated session (cookie) → resolves the caller's own account.
 *   2. Destructive-action session gate — a bindable session id, plus AAL2 when
 *      the user has MFA enrolled (the email code is layered on top of the
 *      existing assurance contract, never instead of it).
 *   3. Exact typed confirmation `DELETE` (anti-accidental, case-sensitive).
 *   4. ATOMIC consumption of the verified challenge — compare-and-set on
 *      `consumed_at`, so a replay of this request finds nothing to spend.
 *
 * ── Ordering: consume, THEN transition ─────────────────────────────────────────
 * The authorization is spent BEFORE `requestAccountDeletion` runs. If the
 * lifecycle transition then fails, the account is NOT marked as scheduled and the
 * challenge is (correctly) used up — the user requests a new code. The inverse
 * ordering would leave a window in which one code could schedule deletion twice.
 * Consuming an authorization is not itself destructive: every rule downstream is
 * still enforced, and a blocked request simply costs the user a fresh code.
 *
 * Self-serve scope: the account is resolved from the session user id — the body
 * carries NO account id, so a caller can only ever request deletion of their own
 * personal account. Idempotent at the service layer: re-requesting an
 * already-pending account returns current state without a second write.
 *
 * SOLE-OWNER GUARD (ACCOUNT-BILLING-LIFECYCLE-2): the "you still own Team/Business
 * accounts" precondition is enforced inside `requestAccountDeletion`, the canonical
 * chokepoint every deletion entry point shares — this route merely PROJECTS the
 * service's typed refusal into HTTP 409. Do not re-add a check here. Because it
 * lives in the service, it is re-evaluated at DELETION time: a user who acquired
 * a team between verifying their code and confirming is still blocked.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  const stepUp = requireDeletionStepUpSession(auth);
  if (!stepUp.ok) return stepUp.response;

  const body = await parseAccountBody(request, RequestDeletionBodySchema);
  if (!body.ok) return body.response;

  // Step-up: spend the verified, session-bound, purpose-bound email challenge.
  const authorization = await consumeDeletionAuthorization({
    userId: auth.userId,
    sessionId: stepUp.sessionId,
    verifiedEmail: auth.email,
  });
  if (!authorization.ok) {
    console.info(
      JSON.stringify({
        event: "account.delete.request.authorization_failed",
        reason: authorization.reason,
      }),
    );
    if (authorization.reason === "not_configured") {
      return NextResponse.json(
        {
          error:
            "Account deletion verification isn't available right now. Contact support@chainreact.app.",
          code: "VERIFICATION_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
    // Generic by design — never disclose whether the challenge was missing,
    // unverified, already spent, or bound to a different session.
    return NextResponse.json(
      {
        error:
          authorization.reason === "expired"
            ? "Your verification expired. Send a new code and try again."
            : "Verify a code sent to your email before deleting your account.",
        code: "VERIFICATION_REQUIRED",
      },
      { status: 401 },
    );
  }

  let state;
  try {
    state = await requestAccountDeletion({
      accountId: auth.account.id,
      requestedByUserId: auth.userId,
    });
  } catch (err) {
    // The canonical sole-owner precondition refused. Nothing was frozen, no subscription
    // was touched, no audit row exists — project it as an actionable 409 with the accounts
    // to resolve. Names are the caller's OWN accounts, so returning them is authorized;
    // no other account's data, no ids beyond the ones they already navigate by, and no
    // Stripe/billing detail is disclosed. The consumed authorization is deliberately NOT
    // restored: a fresh code is cheap, a re-usable authorization is not.
    if (err instanceof OwnedAccountsBlockDeletionError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          ownedAccountCount: err.ownedAccounts.length,
          ownedAccounts: err.ownedAccounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            typeLabel: accountTypeLabel(a.type),
          })),
        },
        { status: 409 },
      );
    }
    throw err;
  }

  const billing = state.billingCancellation;

  console.info(
    JSON.stringify({
      event: "account.delete.request.ok",
      // No user content — lifecycle bookkeeping only.
      deletionStatus: state.deletionStatus,
      billingCancellation: billing?.status ?? "not_applicable",
    }),
  );

  // Partial-failure honesty (ACCOUNT-BILLING-LIFECYCLE-1): the freeze committed, but the
  // subscription could not be cancelled. We must NOT return a clean 200 that reads as
  // "deletion and billing cancellation are complete" — the subscription may still renew.
  // The response reports both facts and tells the user exactly what to do; the sibling
  // retry-billing route re-attempts the cancellation WITHOUT another verification code
  // (it performs no lifecycle transition — see that route). The purge additionally
  // refuses to run while a live subscription remains.
  if (billing?.status === "failed") {
    return NextResponse.json(
      {
        ...toDeletionStatusResponse(state),
        billingCancellation: "failed",
        error:
          "Your account is frozen and scheduled for deletion, but we couldn't cancel your subscription. Try again — your account will not be permanently deleted while a subscription is still active.",
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
