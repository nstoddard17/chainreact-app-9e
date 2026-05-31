import { getDeletionStatusServiceRole } from "@/repositories/accounts";

/**
 * Account freeze guard (4.ACCOUNT-MODEL-10b).
 *
 * A `pending_deletion` account is non-operational during the grace window. RLS
 * already hides its operational data from the session (anon) client; these
 * guards cover the SERVICE-ROLE / background paths that bypass RLS — the
 * execution engine's billing gate, OAuth token refresh-for-use + callback, and
 * workflow activation. Each reads the live deletion status via the service-role
 * client so it is correct even when invoked with no user session.
 *
 * Callers that already hold a fresh `AccountRecord` (route resolver, OAuth
 * connect) check `account.deletionStatus` inline instead — no extra round trip.
 */

export class AccountFrozenError extends Error {
  readonly code = "ACCOUNT_FROZEN" as const;
  constructor(public readonly accountId: string) {
    super(
      `Account ${accountId} is pending deletion and is frozen; the operation is not allowed.`,
    );
    this.name = "AccountFrozenError";
  }
}

/** True when the account is currently `pending_deletion`. */
export async function isAccountFrozen(accountId: string): Promise<boolean> {
  const status = await getDeletionStatusServiceRole(accountId);
  return status === "pending_deletion";
}

/**
 * Throw `AccountFrozenError` when the account is frozen. A missing account
 * (status null) is NOT treated as frozen here — callers that need an existence
 * check do it separately; this guard's sole job is the freeze.
 */
export async function assertAccountOperational(accountId: string): Promise<void> {
  if (await isAccountFrozen(accountId)) {
    throw new AccountFrozenError(accountId);
  }
}
