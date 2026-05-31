import { NextResponse } from "next/server";
import {
  requireOwnPersonalAccount,
  toDeletionStatusResponse,
} from "@/app/api/account/_shared";
import { cancelAccountDeletion } from "@/services/accounts/accountDeletion";

/**
 * POST /api/account/delete/cancel — cancel a pending account deletion during
 * the grace window (4.ACCOUNT-MODEL-10e).
 *
 * Returns the caller's OWN personal account to `active`, clears the request
 * metadata, and settles the audit row. This is the RESTORE path: it is
 * non-destructive (no purge or anonymization has happened yet — those are at
 * purge time), so it requires authentication + ownership only, NOT the password
 * re-auth the request route demands. A safe action should not be gated behind a
 * step-up that could strand a user out of cancelling.
 *
 * Self-serve scope: the account is resolved from the session user id; the body
 * carries no account id, so a caller can only ever cancel their own account.
 * Idempotent: cancelling an already-active account returns current state
 * without a write (service-owned).
 *
 * Resolver note: cancel deliberately uses `requireOwnPersonalAccount` (which
 * still resolves a FROZEN account) rather than the workflow gate
 * `requireUserWithAccount` (which 403s on frozen) — otherwise the freeze would
 * lock the owner out of the very action that undoes it.
 */
export async function POST(): Promise<Response> {
  const auth = await requireOwnPersonalAccount();
  if (!auth.ok) return auth.response;

  const state = await cancelAccountDeletion({ accountId: auth.account.id });

  console.info(
    JSON.stringify({
      event: "account.delete.cancel.ok",
      deletionStatus: state.deletionStatus,
    }),
  );

  return NextResponse.json(toDeletionStatusResponse(state));
}
