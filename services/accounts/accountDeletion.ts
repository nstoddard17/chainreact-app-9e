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
 *
 * ── Sole-owner precondition (ACCOUNT-BILLING-LIFECYCLE-2) ───────────────────────────────
 * The "you still own Team/Business accounts" guard lives HERE, not in the route. It used to
 * be enforced only by `app/api/account/delete/route.ts`, which was survivable while the
 * service merely flipped a status column — but CS-1 made this service cancel a real Stripe
 * subscription, so any other entry point (an admin/system caller, a script, a future
 * deletion surface) would have cancelled billing and frozen the account with NO ownership
 * check at all. It is now the first thing `requestAccountDeletion` does, before any local
 * write and before any Stripe call, so every entry point inherits it.
 *
 * It reads authoritative ownership (`accounts.owner_user_id` via
 * `listOwnedTeamOrgAccountSummaries`) for the OWNER OF THE ACCOUNT BEING DELETED — never the
 * caller's active-account selection and never a client-supplied claim — and it examines ALL
 * of that user's accounts, not just the active one.
 */

export const DEFAULT_GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Thrown when a personal account cannot be deleted because its owner still owns Team /
 * Business (organization) accounts that must be transferred or deleted first.
 *
 * Carries the owned-account summaries so the caller can render an actionable remediation
 * list. Deliberately a typed ERROR rather than a result union: it is a hard precondition
 * failure that must never be mistaken for a successful (or partially successful) deletion by
 * any caller, present or future.
 */
export class OwnedAccountsBlockDeletionError extends Error {
  readonly code = "ACCOUNT_HAS_OWNED_TEAMS" as const;
  readonly ownedAccounts: readonly accountsRepo.OwnedAccountSummary[];
  constructor(ownedAccounts: readonly accountsRepo.OwnedAccountSummary[]) {
    super(
      "Transfer ownership or delete the Team/Business accounts you own before deleting your personal account.",
    );
    this.name = "OwnedAccountsBlockDeletionError";
    this.ownedAccounts = ownedAccounts;
  }
}

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
 * CANONICAL sole-owner precondition (ACCOUNT-BILLING-LIFECYCLE-2).
 *
 * Refuses to start deletion of a PERSONAL account while its owner still owns Team /
 * Business accounts. Applies only to personal accounts: deleting a team/org account IS the
 * resolution of that ownership, so the guard would be self-contradictory there.
 *
 * Ownership comes from `accounts.owner_user_id` for the owner OF THE ACCOUNT BEING DELETED
 * — not the caller, not the active-account selection, not any client input — and covers all
 * of that user's accounts. Throws {@link OwnedAccountsBlockDeletionError}; every caller
 * therefore fails closed.
 */
async function assertOwnerMayDeletePersonalAccount(account: {
  type: string;
  ownerUserId: string;
}): Promise<void> {
  if (account.type !== "personal") return;
  const owned = await accountsRepo.listOwnedTeamOrgAccountSummaries(account.ownerUserId);
  if (owned.length > 0) {
    console.info(
      JSON.stringify({
        event: "account.delete.blocked_owned_accounts",
        // Count only — never the owned account names/ids in a log line.
        ownedAccountCount: owned.length,
      }),
    );
    throw new OwnedAccountsBlockDeletionError(owned);
  }
}

/**
 * Request deletion: freeze the account (`pending_deletion`), stamp the grace
 * deadline, append a `pending` audit row, and cancel the account's ChainReact billing
 * subscription immediately. Idempotent when already pending — and the already-pending path
 * STILL re-attempts the billing cancellation, which is what makes a re-request the
 * user-facing retry for a Stripe outage.
 *
 * Refuses outright (throwing {@link OwnedAccountsBlockDeletionError}) while the owner still
 * owns Team/Business accounts. That check runs FIRST — before the freeze, before the audit
 * row, and before any Stripe call — so a blocked request leaves the personal account, its
 * subscription, the owned teams, their subscriptions, and every membership completely
 * untouched, and creates no retry/purge work item.
 */
export async function requestAccountDeletion(
  input: RequestAccountDeletionInput,
): Promise<AccountDeletionState> {
  // Read the full account once: we need `type` + `ownerUserId` for the precondition, and
  // `deletionStatus` for the idempotency branch.
  const account = await accountsRepo.getByIdServiceRole(input.accountId);
  if (account === null) {
    throw new Error(
      `requestAccountDeletion: account ${input.accountId} not found.`,
    );
  }

  if (account.deletionStatus === "pending_deletion") {
    // Already frozen — no second lifecycle write, but retry the cancellation. It is
    // idempotent (a subscription already gone reports `not_applicable`), so this is safe
    // to repeat and is the recovery path when the first attempt hit a Stripe outage.
    //
    // The sole-owner guard deliberately does NOT run on this branch: it gates ENTERING
    // deletion, and the account can only have entered by passing it. Re-checking here would
    // strand an already-frozen account mid-wind-down (unable to ever finish cancelling its
    // subscription) if ownership somehow changed after the freeze — the opposite of the
    // guard's purpose, which is to protect teams, not to keep billing a departing customer.
    const billingCancellation = await windDownBilling(input.accountId);
    return { ...toState(account), billingCancellation };
  }

  // PRECONDITION — before every side effect: no freeze, no audit row, no Stripe call, no
  // membership change, no worklist entry can happen if this throws.
  await assertOwnerMayDeletePersonalAccount(account);

  const now = input.now ?? new Date();
  const graceDays = input.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const requestedAt = now.toISOString();
  const purgeAfter = new Date(now.getTime() + graceDays * MS_PER_DAY).toISOString();

  // 1. Freeze first — local, durable, reversible, and independent of Stripe.
  const frozen = await accountsRepo.setDeletionPendingServiceRole({
    accountId: input.accountId,
    requestedByUserId: input.requestedByUserId,
    requestedAt,
    purgeAfter,
  });

  await accountDeletionsRepo.insertPending({
    accountId: input.accountId,
    ownerUserId: frozen.ownerUserId,
    requestedByUserId: input.requestedByUserId,
    requestedAt,
    purgeAfter,
  });

  // 2. Then cancel billing, reporting the real outcome (success OR failure) upward.
  const billingCancellation = await windDownBilling(input.accountId);

  return { ...toState(frozen), billingCancellation };
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
