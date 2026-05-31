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
 * NOTE (ledger retention): 10c hard-deletes account-owned ledgers via the
 * account_id ON DELETE CASCADE when the account row is removed — there are no
 * orphans, so purge is SAFE to enable without 10d. 10d (anonymize-then-retain)
 * only CHANGES the ledger disposition from "deleted with the account" to
 * "anonymized + retained for a window". If/when the product wants retained
 * financial-audit ledgers, 10d MUST land before flipping this flag in prod;
 * until then, enabling it is correct but deletes ledgers outright.
 */
export function isAccountPurgeCronEnabled(): boolean {
  return process.env[ACCOUNT_PURGE_CRON_FLAG] === "true";
}
