import type { DeletionStatus } from "@/contracts/accounts";
import * as accountsRepo from "@/repositories/accounts";
import * as accountDeletionsRepo from "@/repositories/accountDeletions";
import { cancelSubscriptionForAccountDeletion } from "@/services/billing/subscriptionCancellation";

/**
 * Account deletion lifecycle service (4.ACCOUNT-MODEL-10b; billing wind-down added in
 * 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Owns the request / cancel transitions of the soft-delete + grace flow. It
 * flips `accounts.deletion_status`, writes the durable `account_deletions`
 * audit row, and cancels the account's ChainReact billing subscription. It does NOT
 * purge, revoke tokens, delete auth.users, or anonymize ledgers — that is 10c/10d. All
 * work runs service-role (the flow is driven by a self-serve route with re-auth, or an
 * admin/service path).
 *
 * Both transitions are idempotent: requesting an already-pending account or
 * cancelling an already-active account returns current state without a second
 * write.
 *
 * ── Billing wind-down (ACCOUNT-BILLING-LIFECYCLE-1) ─────────────────────────────────────
 * Ordering is FREEZE FIRST, then cancel Stripe:
 *
 *   1. The freeze is the safety property. It is local, durable, reversible, and it stops
 *      the account consuming anything it could be billed for. It must not be blocked on a
 *      third party being reachable.
 *   2. The Stripe cancellation follows and its outcome is reported HONESTLY on the returned
 *      state (`billingCancellation`). It is never swallowed and never assumed.
 *
 * Failure semantics the caller must respect:
 *   - **Stripe fails / is unreachable** → the account IS frozen (deletion is scheduled) but
 *     `billingCancellation.status === 'failed'`. The route must NOT report a clean success.
 *     Recovery is durable and re-derivable from state, not held in memory: re-requesting
 *     deletion retries the cancel (the idempotent already-pending path still runs it), the
 *     reconciliation sweep retries it on a schedule, and the purge refuses to run while a
 *     live subscription remains.
 *   - **Stripe succeeds but a later local write fails** → the subscription is canceled and
 *     the account is already frozen (step 1 committed first), so the user is not billed for
 *     an account they cannot use. The audit-row insert is the only remaining write; if it
 *     throws, the account is still `pending_deletion` and a repeat request settles it.
 *
 * Account scoping is inherited from the billing service: cancellation is keyed on
 * `account_id`, so deleting a personal account can only ever cancel that personal account's
 * subscription — never a team/organization account the user belongs to.
 */

export const DEFAULT_GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Outcome of the billing wind-down attached to a deletion request.
 *
 * - `not_applicable` — the account had nothing to cancel (Free, internal billing, or a
 *   subscription that had already ended). No Stripe call was needed or it was a no-op.
 * - `canceled` — a live ChainReact subscription was canceled immediately.
 * - `failed` — Stripe could not be reached or refused. The freeze still stands; the
 *   subscription may still be able to renew and the caller MUST surface this.
 */
export type BillingCancellationStatus = "not_applicable" | "canceled" | "failed";

export interface BillingCancellationOutcome {
  status: BillingCancellationStatus;
  /** Stable machine reason for a failure (never a raw Stripe message). Null on success. */
  reason: "stripe_unavailable" | "stripe_not_configured" | null;
}

export interface AccountDeletionState {
  accountId: string;
  deletionStatus: DeletionStatus;
  deletionRequestedAt: string | null;
  purgeAfter: string | null;
  /**
   * Result of cancelling the account's ChainReact billing subscription as part of this
   * request. Present on `requestAccountDeletion` only — `cancelAccountDeletion` (restore)
   * deliberately performs no billing action.
   */
  billingCancellation?: BillingCancellationOutcome;
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
 * Cancel the account's ChainReact billing subscription as part of a deletion request and
 * translate the result into a reportable outcome. Never throws — a failure is DATA the
 * caller must surface, not an exception that would hide the (already committed) freeze.
 */
async function windDownBilling(accountId: string): Promise<BillingCancellationOutcome> {
  let result: Awaited<ReturnType<typeof cancelSubscriptionForAccountDeletion>>;
  try {
    result = await cancelSubscriptionForAccountDeletion(accountId);
  } catch {
    result = { ok: false, reason: "stripe_unavailable" };
  }

  if (!result.ok) {
    console.info(
      JSON.stringify({
        event: "account.delete.billing_cancel_failed",
        // Lifecycle bookkeeping only — no account id, Stripe id, or provider message.
        reason: result.reason,
      }),
    );
    return { status: "failed", reason: result.reason };
  }

  const status: BillingCancellationStatus =
    result.outcome === "canceled" ? "canceled" : "not_applicable";
  console.info(
    JSON.stringify({ event: "account.delete.billing_cancel_ok", status }),
  );
  return { status, reason: null };
}

/**
 * Request deletion: freeze the account (`pending_deletion`), stamp the grace
 * deadline, append a `pending` audit row, and cancel the account's ChainReact billing
 * subscription immediately. Idempotent when already pending — and the already-pending path
 * STILL re-attempts the billing cancellation, which is what makes a re-request the
 * user-facing retry for a Stripe outage.
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
    // Already frozen — no second lifecycle write, but retry the cancellation. It is
    // idempotent (a subscription already gone reports `not_applicable`), so this is safe
    // to repeat and is the recovery path when the first attempt hit a Stripe outage.
    const billingCancellation = await windDownBilling(input.accountId);
    return { ...toState(existing), billingCancellation };
  }

  const now = input.now ?? new Date();
  const graceDays = input.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const requestedAt = now.toISOString();
  const purgeAfter = new Date(now.getTime() + graceDays * MS_PER_DAY).toISOString();

  // 1. Freeze first — local, durable, reversible, and independent of Stripe.
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

  // 2. Then cancel billing, reporting the real outcome (success OR failure) upward.
  const billingCancellation = await windDownBilling(input.accountId);

  return { ...toState(account), billingCancellation };
}

/**
 * Cancel deletion during the grace window: return the account to `active`,
 * clear the request metadata, and settle the audit row. Idempotent when
 * already active. No ledger anonymization has happened yet (that is 10d at
 * purge time), so the account's DATA is fully restored.
 *
 * BILLING IS DELIBERATELY NOT RESTORED (ACCOUNT-BILLING-LIFECYCLE-1). The deletion request
 * cancelled the ChainReact subscription for real; silently re-creating a paid subscription
 * — a new charge the user never re-authorized — would be wrong. The account comes back on
 * whatever plan Stripe's cancellation left it with (a personal account reverts to Free via
 * the `customer.subscription.deleted` webhook), and the user deliberately subscribes again
 * from Billing if they want a paid plan. This is why the deletion confirmation copy says so
 * up front.
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
