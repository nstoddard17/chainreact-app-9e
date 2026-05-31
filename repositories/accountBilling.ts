import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for account_billing — the account-scoped billing root
 * (Slice 4.ACCOUNT-MODEL-9c live cutover). Mirrors the former user-keyed
 * repositories/userBilling.ts but keys every operation on `account_id` and
 * calls the account-keyed `_v2` RPCs from the 9b foundation.
 *
 * deduct/reserve/reconcile/release/releaseExpired → service-role RPCs. The
 *   gate/engine run server-side without a user session (background execution),
 *   and the mutations must be atomic per row, so they go through the
 *   SECURITY DEFINER `_v2` RPCs rather than read-modify-write.
 *
 * getUsage → SSR-cookie client. RLS gates by account membership, so a call for
 *   an account the caller isn't a member of returns null. Used by cost preview.
 *
 * Billing owner = the account that owns the workflow/run (workflow.accountId),
 * never the actor (triggered_by_user_id / created_by_user_id).
 */

export type DeductTasksResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number };

interface DeductRpcResponse {
  ok: boolean;
  used: number;
  limit: number;
}

export async function deductTasks(
  accountId: string,
  amount: number,
): Promise<DeductTasksResult> {
  const supabase = getServiceRoleClient(
    `billing gate: deductTasks ${amount} for account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("deduct_tasks_if_available_v2", {
    p_account_id: accountId,
    p_amount: amount,
  });
  if (error) {
    throw new Error(`deduct_tasks_if_available_v2 RPC failed: ${error.message}`);
  }
  const response = data as DeductRpcResponse;
  return response.ok
    ? { ok: true, used: response.used, limit: response.limit }
    : { ok: false, used: response.used, limit: response.limit };
}

// ─── Reserve / reconcile wrappers (account-keyed _v2 RPCs) ───────────────────
//
// Thin pass-throughs over the atomic SECURITY DEFINER `_v2` RPCs from
// 20260531000001_account_billing_foundation.sql. All go through the
// service-role client (server-side, no user session); the RPC is the single
// authoritative balance mutator (no read-then-write here).

/** reserve_tasks_if_available_v2 result. */
export interface ReserveTasksResult {
  ok: boolean;
  reason: string;
  used: number;
  reserved: number;
  limit: number;
  amount: number;
}

/** reconcile_task_reservation_v2 result. */
export interface ReconcileReservationResult {
  ok: boolean;
  reason: string;
  used?: number;
  reserved?: number;
  limit?: number;
  charged?: number;
  refunded?: number;
}

/** release_task_reservation_v2 result. */
export interface ReleaseReservationResult {
  ok: boolean;
  reason: string;
  reserved?: number;
  limit?: number;
  released?: number;
}

/** release_expired_reservations_v2 result. */
export interface ReleaseExpiredResult {
  ok: boolean;
  releasedCount: number;
  releasedTasks: number;
}

/** Hold `amount` tasks for `runId` (caller must have created the run row). */
export async function reserveTasks(
  accountId: string,
  amount: number,
  runId: string,
  expiresAt?: string | null,
): Promise<ReserveTasksResult> {
  const supabase = getServiceRoleClient(
    `billing: reserveTasks ${amount} run ${runId} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("reserve_tasks_if_available_v2", {
    p_account_id: accountId,
    p_amount: amount,
    p_run_id: runId,
    p_expires_at: expiresAt ?? null,
  });
  if (error) {
    throw new Error(`reserve_tasks_if_available_v2 RPC failed: ${error.message}`);
  }
  return data as ReserveTasksResult;
}

/** Convert `runId`'s hold into a charge of `actual` (release the remainder). */
export async function reconcileReservation(
  accountId: string,
  runId: string,
  actual: number,
): Promise<ReconcileReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: reconcileReservation run ${runId} actual ${actual} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("reconcile_task_reservation_v2", {
    p_account_id: accountId,
    p_run_id: runId,
    p_actual: actual,
  });
  if (error) {
    throw new Error(`reconcile_task_reservation_v2 RPC failed: ${error.message}`);
  }
  return data as ReconcileReservationResult;
}

/** Release `runId`'s full hold without charging (fatal-before-execution). */
export async function releaseReservation(
  accountId: string,
  runId: string,
): Promise<ReleaseReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: releaseReservation run ${runId} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("release_task_reservation_v2", {
    p_account_id: accountId,
    p_run_id: runId,
  });
  if (error) {
    throw new Error(`release_task_reservation_v2 RPC failed: ${error.message}`);
  }
  return data as ReleaseReservationResult;
}

/** Sweep orphaned holds past their expiry (service/cron intended; sweeps all). */
export async function releaseExpiredReservations(
  now?: string,
): Promise<ReleaseExpiredResult> {
  const supabase = getServiceRoleClient(
    "billing: releaseExpiredReservations sweep",
  );
  const { data, error } = await supabase.rpc("release_expired_reservations_v2", {
    p_now: now ?? new Date().toISOString(),
  });
  if (error) {
    throw new Error(`release_expired_reservations_v2 RPC failed: ${error.message}`);
  }
  const row = data as { released_count: number; released_tasks: number; ok: boolean };
  return {
    ok: row.ok,
    releasedCount: row.released_count,
    releasedTasks: row.released_tasks,
  };
}

export interface AccountBillingUsage {
  tasksUsed: number;
  tasksLimit: number;
  periodStartedAt: string;
}

interface AccountBillingRow {
  tasks_used: number;
  tasks_limit: number;
  period_started_at: string;
}

export async function getUsage(accountId: string): Promise<AccountBillingUsage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_billing")
    .select("tasks_used, tasks_limit, period_started_at")
    .eq("account_id", accountId)
    .maybeSingle<AccountBillingRow>();
  if (error) {
    throw new Error(`account_billing.getUsage failed: ${error.message}`);
  }
  if (!data) return null;
  return {
    tasksUsed: data.tasks_used,
    tasksLimit: data.tasks_limit,
    periodStartedAt: data.period_started_at,
  };
}
