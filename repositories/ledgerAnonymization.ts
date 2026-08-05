import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import type { TableName } from "@/types/tables";

/**
 * Ledger anonymization + retention teardown (4.ACCOUNT-MODEL-10d).
 *
 * Anonymizes the three account-owned ledgers (task_usage_events, ai_cost_events,
 * billing_shadow_comparisons) so their rows survive account deletion as
 * non-account-addressable audit/statistical records, then hard-deletes them
 * after the retention window.
 *
 * Service-role only (purge runs from a cron with no user session). Both
 * operations are idempotent:
 *   - anonymize filters `WHERE account_id = $1` — once nulled, a re-run matches
 *     0 rows.
 *   - delete filters `WHERE anonymized_at IS NOT NULL AND ledger_purge_after <= now`.
 *
 * NULL-OUT CONTRACT (every identifier + free-form / potentially-user-text field):
 *   task_usage_events:  account_id, workflow_id, workflow_run_id, node_id,
 *                       provider, node_type, node_kind; metadata → '{}'.
 *   ai_cost_events:     account_id, user_id, workflow_id, workflow_run_id,
 *                       patch_id, conversation_id; metadata → '{}'.
 *                       Plus tool_name, validation_error_code, safety_block_reason
 *                       — these are untyped `text` (no CHECK), so they MAY contain
 *                       user/provider text → nulled (4.ACCOUNT-MODEL-10d
 *                       clarification). model_name/model_provider/prompt_version
 *                       are bounded provider/version strings → kept.
 *   billing_shadow_comparisons: account_id, workflow_id, workflow_run_id.
 *
 * KEEP (safe aggregates / enums / counts / timestamps / policy): everything
 * else — counts, token/cost numbers, CHECK-constrained event/feature enums,
 * booleans, warning_codes, policy/version, created_at.
 */

export interface AnonymizeLedgersResult {
  taskUsageEvents: number;
  aiCostEvents: number;
  billingShadowComparisons: number;
  total: number;
}

export interface LedgerPurgeResult {
  taskUsageEvents: number;
  aiCostEvents: number;
  billingShadowComparisons: number;
  total: number;
}

/**
 * Anonymize every ledger row owned by `accountId`. Nulls all identifiers +
 * free-form fields and stamps anonymized_at + ledger_purge_after. Returns the
 * per-table counts. Run BEFORE deleting the account so account_id is still
 * present to find the rows (and so nothing cascade-deletes them).
 */
export async function anonymizeAccountLedgers(input: {
  accountId: string;
  anonymizedAt: string;
  ledgerPurgeAfter: string;
}): Promise<AnonymizeLedgersResult> {
  const supabase = getServiceRoleClient(
    `ledger anonymization: anonymize ledgers for account ${input.accountId}`,
  );
  const db = asTypedDb(supabase);
  const stamp = {
    anonymized_at: input.anonymizedAt,
    ledger_purge_after: input.ledgerPurgeAfter,
  };

  const tue = await db
    .from("task_usage_events")
    .update({
      account_id: null,
      workflow_id: null,
      workflow_run_id: null,
      node_id: null,
      provider: null,
      node_type: null,
      node_kind: null,
      metadata: {},
      ...stamp,
    })
    .eq("account_id", input.accountId)
    .select("id");
  if (tue.error) {
    throw new Error(`anonymizeAccountLedgers task_usage_events failed: ${tue.error.message}`);
  }

  const ace = await db
    .from("ai_cost_events")
    .update({
      account_id: null,
      user_id: null,
      workflow_id: null,
      workflow_run_id: null,
      patch_id: null,
      conversation_id: null,
      tool_name: null,
      validation_error_code: null,
      safety_block_reason: null,
      metadata: {},
      ...stamp,
    })
    .eq("account_id", input.accountId)
    .select("id");
  if (ace.error) {
    throw new Error(`anonymizeAccountLedgers ai_cost_events failed: ${ace.error.message}`);
  }

  const bsc = await db
    .from("billing_shadow_comparisons")
    .update({
      account_id: null,
      workflow_id: null,
      workflow_run_id: null,
      ...stamp,
    })
    .eq("account_id", input.accountId)
    .select("id");
  if (bsc.error) {
    throw new Error(
      `anonymizeAccountLedgers billing_shadow_comparisons failed: ${bsc.error.message}`,
    );
  }

  const taskUsageEvents = (tue.data ?? []).length;
  const aiCostEvents = (ace.data ?? []).length;
  const billingShadowComparisons = (bsc.data ?? []).length;
  return {
    taskUsageEvents,
    aiCostEvents,
    billingShadowComparisons,
    total: taskUsageEvents + aiCostEvents + billingShadowComparisons,
  };
}

/**
 * Hard-delete anonymized ledger rows whose retention window has elapsed. Deletes
 * ONLY rows where `anonymized_at IS NOT NULL AND ledger_purge_after <= now` — a
 * non-anonymized row (a normal live ledger row) can never be touched here.
 */
export async function deleteExpiredAnonymizedLedgers(
  now: string,
): Promise<LedgerPurgeResult> {
  const supabase = getServiceRoleClient(
    "ledger anonymization: purge expired anonymized ledger rows",
  );
  const db = asTypedDb(supabase);

  // A bare `string` would defeat the point of the typed client: these are the
  // three anonymizable ledgers, and a typo is now a compile error.
  async function purge(
    table: Extract<TableName, "task_usage_events" | "ai_cost_events" | "billing_shadow_comparisons">,
  ): Promise<number> {
    const { data, error } = await db
      .from(table)
      .delete()
      .not("anonymized_at", "is", null)
      .lte("ledger_purge_after", now)
      .select("id");
    if (error) {
      throw new Error(`deleteExpiredAnonymizedLedgers ${table} failed: ${error.message}`);
    }
    return (data ?? []).length;
  }

  const taskUsageEvents = await purge("task_usage_events");
  const aiCostEvents = await purge("ai_cost_events");
  const billingShadowComparisons = await purge("billing_shadow_comparisons");
  return {
    taskUsageEvents,
    aiCostEvents,
    billingShadowComparisons,
    total: taskUsageEvents + aiCostEvents + billingShadowComparisons,
  };
}
