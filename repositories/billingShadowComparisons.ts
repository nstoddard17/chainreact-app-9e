import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import { narrowColumn } from "@/core/database/columnNarrowing";
import type { TableInsert, TableRow } from "@/types/tables";

/**
 * Repository for billing_shadow_comparisons (Slice 4.COST-14C) — the persisted
 * reserve/reconcile SHADOW ledger (hypothetical billing, separate from the
 * actual task_usage_events / ai_cost_events ledgers).
 *
 * All access goes through the service-role client: the engine writes these in
 * the background (no user session), and the consumers are owner/admin analytics
 * (cross-user). RLS still gates any future user-facing SSR read to own rows.
 *
 * NEVER persist node config / secrets / tokens / payloads / raw warning
 * messages — only ids, counts, booleans, warning CODES, policy version, and
 * timestamps. Callers (the recorder service) pass already-shaped scalar values.
 *
 * TABLE TYPING (SUPABASE-TABLE-TYPING-1C). Table access runs through
 * `asTypedDb`, and typing surfaced one latent defect worth stating plainly:
 *
 * THE CORRELATION IDS ARE NULLABLE. `account_id`, `workflow_id` and
 * `workflow_run_id` were made nullable by the ledger-anonymization migration
 * (20260531000008, slice 4.ACCOUNT-MODEL-10d): when an account is deleted its
 * shadow rows are RETAINED as non-attributable statistical records with those
 * three columns nulled. The handwritten row interface this file used to carry
 * declared all three `string`, so an anonymized row was mapped to a record
 * whose `accountId` was `undefined` while its type said otherwise. The record
 * now says what the table says, and exposes `anonymizedAt` so a reader can tell
 * a retention-anonymized row from a malformed one instead of guessing.
 *
 * `billing_mode` is CHECK-constrained to 'shadow'
 * (billing_shadow_comparisons_mode_chk) but generated as plain `string`. It is
 * narrowed FAIL-CLOSED — an unexpected mode is a row this repository refuses to
 * describe, never a value asserted into the union.
 */

export interface BillingShadowComparisonInsert {
  accountId: string;
  workflowId: string;
  workflowRunId: string;
  flatChargedTasks: number;
  estimatedTasksPerRun: number;
  actualBillableTasks: number;
  proposedReservedTasks: number;
  proposedReconciledTasks: number;
  proposedRefundedTasks: number;
  deltaVsFlat: number;
  wouldHaveReserved: boolean;
  wouldHaveHadEnoughBalance: boolean | null;
  warningCodes: string[];
  policyVersion: string;
}

/** The closed set enforced by `billing_shadow_comparisons_mode_chk`. */
export const BILLING_SHADOW_MODES = ["shadow"] as const;
export type BillingShadowMode = (typeof BILLING_SHADOW_MODES)[number];

/**
 * A persisted comparison. NOT `extends BillingShadowComparisonInsert`: what the
 * engine WRITES always carries its correlation ids, but what the table RETURNS
 * may have had them anonymized away, and one interface cannot honestly claim
 * both.
 */
export interface BillingShadowComparisonRecord {
  id: string;
  /** null once the owning account has been deleted + the row anonymized. */
  accountId: string | null;
  /** null once anonymized — the row is no longer attributable to a workflow. */
  workflowId: string | null;
  /** null once anonymized — the row is no longer attributable to a run. */
  workflowRunId: string | null;
  flatChargedTasks: number;
  estimatedTasksPerRun: number;
  actualBillableTasks: number;
  proposedReservedTasks: number;
  proposedReconciledTasks: number;
  proposedRefundedTasks: number;
  deltaVsFlat: number;
  wouldHaveReserved: boolean;
  wouldHaveHadEnoughBalance: boolean | null;
  warningCodes: string[];
  policyVersion: string;
  billingMode: BillingShadowMode;
  /** When retention anonymization stripped the ids; null while attributable. */
  anonymizedAt: string | null;
  createdAt: string;
}

function toInsertRow(e: BillingShadowComparisonInsert) {
  return {
    account_id: e.accountId,
    workflow_id: e.workflowId,
    workflow_run_id: e.workflowRunId,
    flat_charged_tasks: e.flatChargedTasks,
    estimated_tasks_per_run: e.estimatedTasksPerRun,
    actual_billable_tasks: e.actualBillableTasks,
    proposed_reserved_tasks: e.proposedReservedTasks,
    proposed_reconciled_tasks: e.proposedReconciledTasks,
    proposed_refunded_tasks: e.proposedRefundedTasks,
    delta_vs_flat: e.deltaVsFlat,
    would_have_reserved: e.wouldHaveReserved,
    would_have_had_enough_balance: e.wouldHaveHadEnoughBalance,
    warning_codes: e.warningCodes,
    policy_version: e.policyVersion,
    billing_mode: "shadow",
  } satisfies TableInsert<"billing_shadow_comparisons">;
}

function rowToRecord(
  row: TableRow<"billing_shadow_comparisons">,
): BillingShadowComparisonRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    flatChargedTasks: row.flat_charged_tasks,
    estimatedTasksPerRun: row.estimated_tasks_per_run,
    actualBillableTasks: row.actual_billable_tasks,
    proposedReservedTasks: row.proposed_reserved_tasks,
    proposedReconciledTasks: row.proposed_reconciled_tasks,
    proposedRefundedTasks: row.proposed_refunded_tasks,
    deltaVsFlat: row.delta_vs_flat,
    wouldHaveReserved: row.would_have_reserved,
    wouldHaveHadEnoughBalance: row.would_have_had_enough_balance,
    warningCodes: row.warning_codes ?? [],
    policyVersion: row.policy_version,
    billingMode: narrowColumn(
      "billing_shadow_comparisons.billing_mode",
      BILLING_SHADOW_MODES,
      row.billing_mode,
    ),
    anonymizedAt: row.anonymized_at,
    createdAt: row.created_at,
  };
}

/**
 * Append one shadow comparison. IDEMPOTENT on workflow_run_id — a duplicate
 * insert (engine retry) is ignored, keeping the first comparison for the run.
 */
export async function insertComparison(
  comparison: BillingShadowComparisonInsert,
): Promise<void> {
  const supabase = asTypedDb(
    getServiceRoleClient(
      `engine: billing_shadow_comparisons insert (run ${comparison.workflowRunId})`,
    ),
  );
  const { error } = await supabase
    .from("billing_shadow_comparisons")
    .upsert(toInsertRow(comparison), {
      onConflict: "workflow_run_id",
      ignoreDuplicates: true,
    });
  if (error) {
    throw new Error(
      `billing_shadow_comparisons.insertComparison failed: ${error.message}`,
    );
  }
}

/** Filters for an owner/admin shadow analytics range read. */
export interface ShadowComparisonQuery {
  from?: string;
  to?: string;
  accountId?: string;
  workflowId?: string;
  limit?: number;
}

/**
 * Owner/admin cross-user range read (service-role, bypasses RLS). For
 * server-side owner/admin shadow analytics only.
 */
export async function listForRange(
  q: ShadowComparisonQuery = {},
): Promise<readonly BillingShadowComparisonRecord[]> {
  const supabase = asTypedDb(
    getServiceRoleClient(
      "analytics: billing_shadow_comparisons range read (owner/admin)",
    ),
  );
  let query = supabase.from("billing_shadow_comparisons").select("*");
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.accountId) query = query.eq("account_id", q.accountId);
  if (q.workflowId) query = query.eq("workflow_id", q.workflowId);
  query = query.order("created_at", { ascending: false });
  if (q.limit !== undefined) query = query.limit(q.limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(
      `billing_shadow_comparisons.listForRange failed: ${error.message}`,
    );
  }
  return (data ?? []).map(rowToRecord);
}

/** Owner/admin read of one workflow's shadow comparisons (service-role). */
export async function listForWorkflow(
  workflowId: string,
): Promise<readonly BillingShadowComparisonRecord[]> {
  return listForRange({ workflowId });
}
