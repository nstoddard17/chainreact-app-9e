import { decryptToken } from "@/core/encryption/tokens";
import { revokeProviderToken } from "@/services/oauth/dispatcher";
import { LEDGER_RETENTION_DAYS } from "@/services/accounts/accountDeletionFlags";
import * as accountsRepo from "@/repositories/accounts";
import * as accountDeletionsRepo from "@/repositories/accountDeletions";
import * as accountPurgeRepo from "@/repositories/accountPurge";
import * as ledgerAnonymizationRepo from "@/repositories/ledgerAnonymization";
import {
  accountHasRenewableSubscription,
  cancelSubscriptionForAccountDeletion,
} from "@/services/billing/subscriptionCancellation";

/**
 * Account purge service (4.ACCOUNT-MODEL-10c).
 *
 * Permanently tears down an account that is past its grace window, in
 * RESTRICT-safe order, best-effort-revoking provider tokens first and deleting
 * auth.users LAST. NO ledger anonymization (10d) — account-owned ledgers are
 * removed by the account-row delete's ON DELETE CASCADE, so there are no
 * orphans.
 *
 * Correctness invariants (enforced here):
 *   - Only purges accounts with deletion_status='pending_deletion' AND
 *     purge_after <= now. Active or still-in-grace accounts are refused.
 *   - Provider revoke is best-effort with bounded retry; failure is recorded
 *     but NEVER blocks the delete. The encrypted credential row is deleted
 *     regardless of revoke outcome.
 *   - auth.admin.deleteUser runs last (accounts.owner_user_id RESTRICT).
 *   - Idempotent / retry-safe: every delete is "delete WHERE present", and a
 *     purge interrupted after the account row was deleted is recovered via the
 *     still-pending audit row (which carries owner_user_id).
 *
 * All work is service-role (no user session). Cancel/restore (10b) is untouched
 * — an account still inside its grace window is never seen by listDuePending.
 */

const REVOKE_MAX_ATTEMPTS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PurgeSkipReason =
  | "account_not_found"
  | "not_pending_deletion"
  | "grace_not_elapsed"
  /**
   * ACCOUNT-BILLING-LIFECYCLE-1 fail-closed: the account still has a live ChainReact
   * subscription (or we could not prove it doesn't). Purge destroys the account row — and
   * with it the only handle to that subscription — so it must not proceed. The next cron
   * tick retries: the purge re-attempts the cancellation before re-checking.
   */
  | "renewable_subscription";

export interface PurgeCounts {
  ledgerRowsAnonymized: number;
  integrationsRevoked: number;
  integrationsRevokeFailed: number;
  integrationsDeleted: number;
  workflowsDeleted: number;
  workflowRunsDeleted: number;
  billingDeleted: boolean;
  accountDeleted: boolean;
  authUserDeleted: boolean;
}

export type PurgeAccountResult =
  | { status: "skipped"; reason: PurgeSkipReason }
  | { status: "purged"; accountId: string; counts: PurgeCounts }
  | { status: "recovered"; accountId: string };

export interface PurgeAccountInput {
  accountId: string;
  /** Injected for deterministic tests; defaults to the current time. */
  now?: Date;
}

function log(event: string, extra: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, ...extra }));
}

/**
 * Best-effort provider revoke with bounded retry. Decrypts the stored access
 * token and asks the provider to revoke it. Returns true on success, false if
 * every attempt failed (or the token couldn't be decrypted). NEVER throws —
 * revocation must not block deletion. NEVER logs the token.
 */
async function revokeOneIntegration(
  row: accountPurgeRepo.PurgeIntegrationRow,
): Promise<boolean> {
  let token: string;
  try {
    token = decryptToken(row.accessTokenEncrypted);
  } catch (err) {
    log("account.purge.revoke_decrypt_failed", {
      integrationId: row.id,
      provider: row.provider,
      error: (err as Error).message,
    });
    return false;
  }

  for (let attempt = 1; attempt <= REVOKE_MAX_ATTEMPTS; attempt++) {
    try {
      await revokeProviderToken(row.provider, token);
      return true;
    } catch (err) {
      log("account.purge.revoke_attempt_failed", {
        integrationId: row.id,
        provider: row.provider,
        attempt,
        maxAttempts: REVOKE_MAX_ATTEMPTS,
        error: (err as Error).message,
      });
    }
  }
  return false;
}

/**
 * Purge a single account. See module doc for invariants. Returns a skipped
 * outcome (no mutation) when the account is not eligible.
 */
export async function purgeAccount(
  input: PurgeAccountInput,
): Promise<PurgeAccountResult> {
  const now = input.now ?? new Date();
  const account = await accountsRepo.getByIdServiceRole(input.accountId);

  // Recovery: account row already gone but a pending audit row remains → a
  // prior purge died between deleting the account and deleting auth.users.
  // Finish it: delete auth.users (idempotent) + settle the audit row.
  if (!account) {
    const ownerUserId =
      await accountDeletionsRepo.getPendingOwnerForOrphanedAccount(input.accountId);
    if (!ownerUserId) {
      return { status: "skipped", reason: "account_not_found" };
    }
    log("account.purge.recover_interrupted", { accountId: input.accountId });
    await accountPurgeRepo.deleteAuthUser(ownerUserId);
    await accountDeletionsRepo.markPurged({
      accountId: input.accountId,
      purgedAt: now.toISOString(),
      counts: { recovered: true, authUserDeleted: true },
    });
    return { status: "recovered", accountId: input.accountId };
  }

  // Eligibility — the core "never purge what shouldn't be purged" guard.
  if (account.deletionStatus !== "pending_deletion") {
    return { status: "skipped", reason: "not_pending_deletion" };
  }
  if (!account.purgeAfter || new Date(account.purgeAfter) > now) {
    return { status: "skipped", reason: "grace_not_elapsed" };
  }

  // BILLING FAIL-CLOSED (ACCOUNT-BILLING-LIFECYCLE-1). The deletion request already
  // cancelled the subscription immediately, so by now there should be nothing live. If
  // there is (a Stripe outage at request time, a subscription re-created out of band), we
  // must not destroy the account: `deleteAccountBilling` below removes the
  // `stripe_subscription_id` row, which is the ONLY handle we have to that subscription —
  // purging first would leave a customer being billed with no way for us to find it.
  //
  // Retry-then-verify, in that order: re-attempt the (idempotent) cancellation, then ask
  // Stripe authoritatively. An UNVERIFIABLE answer skips too — "we couldn't check" is
  // never treated as "it's safe".
  await cancelSubscriptionForAccountDeletion(input.accountId);
  const renewable = await accountHasRenewableSubscription(input.accountId);
  if (!renewable.ok || renewable.renewable) {
    log("account.purge.blocked_renewable_subscription", {
      accountId: input.accountId,
      verified: renewable.ok,
    });
    return { status: "skipped", reason: "renewable_subscription" };
  }

  const ownerUserId = account.ownerUserId;
  log("account.purge.started", { accountId: input.accountId });

  const counts: PurgeCounts = {
    ledgerRowsAnonymized: 0,
    integrationsRevoked: 0,
    integrationsRevokeFailed: 0,
    integrationsDeleted: 0,
    workflowsDeleted: 0,
    workflowRunsDeleted: 0,
    billingDeleted: false,
    accountDeleted: false,
    authUserDeleted: false,
  };

  // 0. Anonymize account-owned ledgers FIRST — before any delete (4.ACCOUNT-
  //    MODEL-10d). Must precede the workflow_runs/workflows/account deletes so
  //    the rows are (a) still findable by account_id and (b) detached so they do
  //    NOT cascade-delete with the account. After this the rows have NULL
  //    account_id/user_id/workflow refs + stripped metadata, are invisible to
  //    account-membership RLS, and carry anonymized_at + ledger_purge_after for
  //    the retention cron.
  const ledgerPurgeAfter = new Date(
    now.getTime() + LEDGER_RETENTION_DAYS * MS_PER_DAY,
  ).toISOString();
  const anonymized = await ledgerAnonymizationRepo.anonymizeAccountLedgers({
    accountId: input.accountId,
    anonymizedAt: now.toISOString(),
    ledgerPurgeAfter,
  });
  counts.ledgerRowsAnonymized = anonymized.total;
  log("account.purge.ledgers_anonymized", {
    accountId: input.accountId,
    ...anonymized,
  });

  // 1. Integrations: best-effort revoke (with retry), then delete the row —
  //    regardless of revoke outcome. RESTRICT → must precede the account delete.
  const integrations = await accountPurgeRepo.listIntegrationsForPurge(input.accountId);
  for (const row of integrations) {
    const revoked = await revokeOneIntegration(row);
    if (revoked) counts.integrationsRevoked += 1;
    else counts.integrationsRevokeFailed += 1;
    await accountPurgeRepo.deleteIntegration(row.id);
    counts.integrationsDeleted += 1;
  }

  // 2. workflow_runs (RESTRICT). 3. workflows (RESTRICT; cascades children).
  counts.workflowRunsDeleted = await accountPurgeRepo.deleteWorkflowRunsByAccount(
    input.accountId,
  );
  counts.workflowsDeleted = await accountPurgeRepo.deleteWorkflowsByAccount(
    input.accountId,
  );

  // 4. account_billing (RESTRICT; counter state, not audit).
  await accountPurgeRepo.deleteAccountBilling(input.accountId);
  counts.billingDeleted = true;

  // 5. account row — cascades memberships + account-owned ledgers (account_id
  //    ON DELETE CASCADE). After this the account is gone; recovery path covers
  //    a crash before step 6.
  await accountPurgeRepo.deleteAccount(input.accountId);
  counts.accountDeleted = true;

  // 6. auth.users LAST (owner_user_id RESTRICT lifted once the account is gone).
  await accountPurgeRepo.deleteAuthUser(ownerUserId);
  counts.authUserDeleted = true;

  // 7. Settle the durable audit row.
  await accountDeletionsRepo.markPurged({
    accountId: input.accountId,
    purgedAt: now.toISOString(),
    counts: { ...counts },
  });

  log("account.purge.completed", { accountId: input.accountId, ...counts });
  return { status: "purged", accountId: input.accountId, counts };
}

export interface PurgeDueResult {
  scanned: number;
  purged: number;
  recovered: number;
  skipped: number;
  failed: number;
}

/**
 * Purge every account whose grace window has elapsed. Per-account failures are
 * isolated (logged, counted) so one bad account never strands the rest — the
 * next cron tick retries it (purge is idempotent). Used by the cron route.
 */
export async function purgeDuePendingAccounts(now?: Date): Promise<PurgeDueResult> {
  const at = now ?? new Date();
  const due = await accountPurgeRepo.listDuePendingAccounts(at.toISOString());
  const result: PurgeDueResult = {
    scanned: due.length,
    purged: 0,
    recovered: 0,
    skipped: 0,
    failed: 0,
  };

  for (const acct of due) {
    try {
      const outcome = await purgeAccount({ accountId: acct.accountId, now: at });
      if (outcome.status === "purged") result.purged += 1;
      else if (outcome.status === "recovered") result.recovered += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      log("account.purge.account_failed", {
        accountId: acct.accountId,
        error: (err as Error).message,
      });
    }
  }

  log("account.purge.sweep_done", { ...result });
  return result;
}

export interface BillingReconcileResult {
  /** Frozen (`pending_deletion`) accounts examined. */
  scanned: number;
  /** Accounts where a live subscription was found and cancelled by this sweep. */
  canceled: number;
  /** Accounts that already had nothing to cancel. */
  alreadyClear: number;
  /** Accounts whose cancellation could not be completed — retried on the next tick. */
  failed: number;
}

/**
 * Billing reconciliation sweep for accounts already in `pending_deletion`
 * (ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * This is the DURABLE retry for the one partial-failure case that matters: the deletion
 * request froze the account but Stripe was unreachable, so the subscription can still
 * renew. Nothing is held in memory — the worklist is derived every tick from durable state
 * (`accounts.deletion_status='pending_deletion'`), and the operation it performs is
 * idempotent, so an account that is already clear costs one status read and reports
 * `alreadyClear`.
 *
 * Deliberately NON-DESTRUCTIVE to data: it only cancels billing for accounts the user has
 * already asked to delete. That is why it is not gated behind the destructive-purge flag —
 * leaving it off would keep charging customers who asked to leave. It ignores the grace
 * window entirely (waiting 30 days to stop billing would defeat the purpose) and never
 * deletes, freezes, or unfreezes anything.
 */
export async function reconcilePendingDeletionBilling(): Promise<BillingReconcileResult> {
  const pending = await accountPurgeRepo.listPendingDeletionAccounts();
  const result: BillingReconcileResult = {
    scanned: pending.length,
    canceled: 0,
    alreadyClear: 0,
    failed: 0,
  };

  for (const accountId of pending) {
    try {
      const outcome = await cancelSubscriptionForAccountDeletion(accountId);
      if (!outcome.ok) result.failed += 1;
      else if (outcome.outcome === "canceled") result.canceled += 1;
      else result.alreadyClear += 1;
    } catch (err) {
      // Per-account isolation: one bad account never strands the rest.
      result.failed += 1;
      log("account.billing_reconcile.account_failed", {
        accountId,
        error: (err as Error).message,
      });
    }
  }

  log("account.billing_reconcile.sweep_done", { ...result });
  return result;
}
