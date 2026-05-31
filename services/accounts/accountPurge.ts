import { decryptToken } from "@/core/encryption/tokens";
import { revokeProviderToken } from "@/services/oauth/dispatcher";
import * as accountsRepo from "@/repositories/accounts";
import * as accountDeletionsRepo from "@/repositories/accountDeletions";
import * as accountPurgeRepo from "@/repositories/accountPurge";

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

export type PurgeSkipReason =
  | "account_not_found"
  | "not_pending_deletion"
  | "grace_not_elapsed";

export interface PurgeCounts {
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

  const ownerUserId = account.ownerUserId;
  log("account.purge.started", { accountId: input.accountId });

  const counts: PurgeCounts = {
    integrationsRevoked: 0,
    integrationsRevokeFailed: 0,
    integrationsDeleted: 0,
    workflowsDeleted: 0,
    workflowRunsDeleted: 0,
    billingDeleted: false,
    accountDeleted: false,
    authUserDeleted: false,
  };

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
