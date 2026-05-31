/**
 * Account-deletion rollout flags (4.ACCOUNT-MODEL-10c).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/billing/billingFeatureFlags.ts.
 */

/** Env var gating the destructive purge cron. */
export const ACCOUNT_PURGE_CRON_FLAG = "ENABLE_ACCOUNT_PURGE_CRON";

/**
 * DEFAULT OFF. When false, the purge cron route authenticates but performs NO
 * teardown — it returns a skipped summary. This is the safety switch for the
 * destructive flow: the purge SERVICE (purgeAccount) works regardless when
 * called directly (tests, admin), but the scheduled fan-out only runs when this
 * is explicitly "true".
 *
 * NOTE (ledger retention): as of 10d, purgeAccount ANONYMIZES the account-owned
 * ledgers (task_usage_events / ai_cost_events / billing_shadow_comparisons)
 * before deleting the account — the rows survive as non-account-addressable
 * audit records and are hard-deleted later by the ledger-purge cron (gated by
 * ENABLE_LEDGER_PURGE_CRON). Enabling this flag is safe either way.
 */
export function isAccountPurgeCronEnabled(): boolean {
  return process.env[ACCOUNT_PURGE_CRON_FLAG] === "true";
}

/** Env var gating the anonymized-ledger retention cron (4.ACCOUNT-MODEL-10d). */
export const LEDGER_PURGE_CRON_FLAG = "ENABLE_LEDGER_PURGE_CRON";

/**
 * DEFAULT OFF. When false, the ledger-purge cron route authenticates but
 * performs NO deletion — returns a skipped summary. Separate switch from
 * ENABLE_ACCOUNT_PURGE_CRON: this one gates only the hard-delete of
 * already-anonymized, retention-elapsed ledger rows. The delete service works
 * when called directly (tests/admin) regardless of the flag.
 */
export function isLedgerPurgeCronEnabled(): boolean {
  return process.env[LEDGER_PURGE_CRON_FLAG] === "true";
}

/**
 * Retention window (days) an anonymized ledger row is kept before the
 * ledger-purge cron hard-deletes it. Plan default = 90. Set on each row's
 * `ledger_purge_after` at anonymization time.
 */
export const LEDGER_RETENTION_DAYS = 90;
