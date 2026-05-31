import type { DeletionStatus } from "@/contracts/accounts";
import * as accountsRepo from "@/repositories/accounts";
import * as accountDeletionsRepo from "@/repositories/accountDeletions";

/**
 * Account deletion lifecycle service (4.ACCOUNT-MODEL-10b).
 *
 * Owns the request / cancel transitions of the soft-delete + grace flow. It
 * flips `accounts.deletion_status` and writes the durable `account_deletions`
 * audit row together. It does NOT purge, revoke tokens, delete auth.users, or
 * anonymize ledgers — that is 10c/10d. All work runs service-role (the flow is
 * driven by a self-serve route with re-auth, or an admin/service path).
 *
 * Both transitions are idempotent: requesting an already-pending account or
 * cancelling an already-active account returns current state without a second
 * write.
 */

export const DEFAULT_GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AccountDeletionState {
  accountId: string;
  deletionStatus: DeletionStatus;
  deletionRequestedAt: string | null;
  purgeAfter: string | null;
}

export interface RequestAccountDeletionInput {
  accountId: string;
  /** The user who requested it (self-serve) or null for a system/admin action. */
  requestedByUserId: string | null;
  /** Override the grace window; defaults to DEFAULT_GRACE_PERIOD_DAYS. */
  gracePeriodDays?: number;
  /** Injected for deterministic tests; defaults to the current time. */
  now?: Date;
}

export interface CancelAccountDeletionInput {
  accountId: string;
  /** Injected for deterministic tests; defaults to the current time. */
  now?: Date;
}

function toState(account: {
  id: string;
  deletionStatus: DeletionStatus;
  deletionRequestedAt: string | null;
  purgeAfter: string | null;
}): AccountDeletionState {
  return {
    accountId: account.id,
    deletionStatus: account.deletionStatus,
    deletionRequestedAt: account.deletionRequestedAt,
    purgeAfter: account.purgeAfter,
  };
}

/**
 * Request deletion: freeze the account (`pending_deletion`), stamp the grace
 * deadline, and append a `pending` audit row. Idempotent when already pending.
 */
export async function requestAccountDeletion(
  input: RequestAccountDeletionInput,
): Promise<AccountDeletionState> {
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === null) {
    throw new Error(
      `requestAccountDeletion: account ${input.accountId} not found.`,
    );
  }
  if (status === "pending_deletion") {
    const existing = await accountsRepo.getByIdServiceRole(input.accountId);
    if (!existing) {
      throw new Error(
        `requestAccountDeletion: account ${input.accountId} vanished mid-request.`,
      );
    }
    return toState(existing);
  }

  const now = input.now ?? new Date();
  const graceDays = input.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const requestedAt = now.toISOString();
  const purgeAfter = new Date(now.getTime() + graceDays * MS_PER_DAY).toISOString();

  const account = await accountsRepo.setDeletionPendingServiceRole({
    accountId: input.accountId,
    requestedByUserId: input.requestedByUserId,
    requestedAt,
    purgeAfter,
  });

  await accountDeletionsRepo.insertPending({
    accountId: input.accountId,
    ownerUserId: account.ownerUserId,
    requestedByUserId: input.requestedByUserId,
    requestedAt,
    purgeAfter,
  });

  return toState(account);
}

/**
 * Cancel deletion during the grace window: return the account to `active`,
 * clear the request metadata, and settle the audit row. Idempotent when
 * already active. No ledger anonymization has happened yet (that is 10d at
 * purge time), so the account is fully restored.
 */
export async function cancelAccountDeletion(
  input: CancelAccountDeletionInput,
): Promise<AccountDeletionState> {
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === null) {
    throw new Error(
      `cancelAccountDeletion: account ${input.accountId} not found.`,
    );
  }
  if (status === "active") {
    const existing = await accountsRepo.getByIdServiceRole(input.accountId);
    if (!existing) {
      throw new Error(
        `cancelAccountDeletion: account ${input.accountId} vanished mid-cancel.`,
      );
    }
    return toState(existing);
  }

  const now = input.now ?? new Date();
  const account = await accountsRepo.clearDeletionServiceRole(input.accountId);
  await accountDeletionsRepo.markPendingCancelled(
    input.accountId,
    now.toISOString(),
  );
  return toState(account);
}

/** Read the current lifecycle state of an account (service-role). */
export async function getAccountDeletionState(
  accountId: string,
): Promise<AccountDeletionState | null> {
  const account = await accountsRepo.getByIdServiceRole(accountId);
  return account ? toState(account) : null;
}
