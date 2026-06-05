import { NextResponse } from "next/server";
import {
  requireOwnPersonalAccount,
  parseAccountBody,
  RequestDeletionBodySchema,
  toDeletionStatusResponse,
} from "@/app/api/account/_shared";
import { verifyPasswordReauth } from "@/services/accounts/accountDeletionReauth";
import { requestAccountDeletion } from "@/services/accounts/accountDeletion";
import {
  listOwnedTeamOrgAccountSummaries,
  type OwnedAccountSummary,
} from "@/repositories/accounts";

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
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  // 4.ACCOUNT-MODEL-13 deletion guard (remediation: TL-4). Deleting the personal
  // account leads to user deletion (10c purge → auth.admin.deleteUser). The
  // `accounts.owner_user_id → auth.users ON DELETE RESTRICT` FK blocks that while
  // the user still owns any team/org account, so refuse up front. Now that owner
  // transfer (TL-2) and leave (TL-3) exist, return the owned-account summaries so
  // the user can resolve each — transfer ownership or delete it. The hard block
  // is preserved: deletion never proceeds while owned team/business accounts
  // remain, and nothing is auto-transferred or auto-deleted.
  const ownedTeamOrg = await listOwnedTeamOrgAccountSummaries(auth.userId);
  if (ownedTeamOrg.length > 0) {
    return NextResponse.json(
      {
        error:
          "Transfer ownership or delete the Team/Business accounts you own before deleting your personal account.",
        code: "ACCOUNT_HAS_OWNED_TEAMS",
        ownedAccountCount: ownedTeamOrg.length,
        ownedAccounts: ownedTeamOrg.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          typeLabel: accountTypeLabel(a.type),
        })),
      },
      { status: 409 },
    );
  }

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

  const state = await requestAccountDeletion({
    accountId: auth.account.id,
    requestedByUserId: auth.userId,
  });

  console.info(
    JSON.stringify({
      event: "account.delete.request.ok",
      // No user content — lifecycle bookkeeping only.
      deletionStatus: state.deletionStatus,
    }),
  );

  return NextResponse.json(toDeletionStatusResponse(state));
}
