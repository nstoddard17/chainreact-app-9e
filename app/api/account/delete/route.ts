import { NextResponse } from "next/server";
import {
  requireOwnPersonalAccount,
  parseAccountBody,
  RequestDeletionBodySchema,
  toDeletionStatusResponse,
} from "@/app/api/account/_shared";
import { verifyPasswordReauth } from "@/services/accounts/accountDeletionReauth";
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
 * (4.ACCOUNT-MODEL-10e).
 *
 * Moves the caller's OWN personal account to `pending_deletion` (frozen,
 * reversible) and stamps the grace deadline + a durable audit row. It does NOT
 * purge — that is the flag-gated `purge-pending-deletions` cron (10c), default
 * OFF — so this route only ever soft-freezes and is fully reversible via the
 * sibling cancel route during the grace window.
 *
 * Guards (high-risk, irreversible-after-grace action):
 *   1. Authenticated session (cookie) → resolves the caller's own account.
 *   2. Typed confirmation phrase (anti-accidental).
 *   3. Password re-auth (step-up) verified on a throwaway client that never
 *      touches the live session.
 *
 * Self-serve scope: the account is resolved from the session user id — the body
 * carries NO account id, so a caller can only ever request deletion of their
 * own personal account. Idempotent: re-requesting an already-pending account
 * returns the current state without a second write (service-owned).
 *
 * The 10b freeze remains the enforcement layer: once pending, every operational
 * surface (workflow create/list/run, billing, OAuth, activation, engine) is
 * already blocked — this route does not re-implement that.
 *
 * SOLE-OWNER GUARD (ACCOUNT-BILLING-LIFECYCLE-2): the "you still own Team/Business
 * accounts" precondition is NO LONGER enforced here. It moved into
 * `requestAccountDeletion`, which is the canonical chokepoint every deletion entry point
 * shares — this route merely PROJECTS the service's typed refusal into HTTP 409. Do not
 * re-add a check here: a second copy would drift, and a route-level-only guard is exactly
 * what let a non-UI caller reach the freeze + Stripe cancellation unguarded.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, RequestDeletionBodySchema);
  if (!body.ok) return body.response;

  // Step-up: re-verify the caller's password before a destructive request.
  const reauth = await verifyPasswordReauth(auth.email, body.data.password);
  if (!reauth.ok) {
    console.info(
      JSON.stringify({
        event: "account.delete.request.reauth_failed",
        reason: reauth.reason,
      }),
    );
    // Generic message — never disclose whether email/password/setup was at fault.
    return NextResponse.json(
      { error: "Password confirmation failed.", code: "REAUTH_FAILED" },
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
    // Stripe/billing detail is disclosed.
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
  // The response reports both facts and tells the user exactly what to do; retrying the
  // deletion request re-attempts the cancellation (the service's already-pending path is
  // idempotent). The purge additionally refuses to run while a live subscription remains.
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
