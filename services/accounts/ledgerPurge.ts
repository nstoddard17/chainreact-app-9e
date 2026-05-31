import * as ledgerAnonymizationRepo from "@/repositories/ledgerAnonymization";

/**
 * Anonymized-ledger retention sweep (4.ACCOUNT-MODEL-10d).
 *
 * Hard-deletes ledger rows that were anonymized at account purge and whose
 * retention window (`ledger_purge_after`) has elapsed. Thin service over the
 * repo so the cron route stays trivial. Only ever touches rows where
 * `anonymized_at IS NOT NULL AND ledger_purge_after <= now` — a normal live
 * ledger row is never reachable here.
 */

export interface LedgerPurgeSummary {
  taskUsageEvents: number;
  aiCostEvents: number;
  billingShadowComparisons: number;
  total: number;
}

export async function purgeExpiredAnonymizedLedgers(
  now?: Date,
): Promise<LedgerPurgeSummary> {
  const at = (now ?? new Date()).toISOString();
  const result = await ledgerAnonymizationRepo.deleteExpiredAnonymizedLedgers(at);
  return {
    taskUsageEvents: result.taskUsageEvents,
    aiCostEvents: result.aiCostEvents,
    billingShadowComparisons: result.billingShadowComparisons,
    total: result.total,
  };
}
