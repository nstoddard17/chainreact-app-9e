import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * @deprecated 4.ACCOUNT-MODEL-9c — live billing was cut over to account_billing
 * (see repositories/accountBilling.ts + the account-keyed `_v2` RPCs). No
 * production caller imports this module anymore. It is retained for the
 * deprecation window only: the user-keyed RPCs + user_billing table still exist
 * (the 9b parity test uses them as the equivalence reference), and several
 * unit tests still `jest.mock` this path. A later cleanup slice drops the
 * user-keyed RPCs + user_billing and removes this file.
 *
 * Repository for user_billing.
 *
 * deductTasks → service-role RPC. The gate runs server-side without a user
 *   session (the engine fires from the webhook dispatcher in background),
 *   and the deduction must be atomic per row, so the helper goes through
 *   deduct_tasks_if_available rather than read-modify-write.
 *
 * getUsage → SSR-cookie client. RLS gates by auth.uid() = user_id, so a
 *   call with another user's id returns null. Used by future UI surfaces.
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
  userId: string,
  amount: number,
): Promise<DeductTasksResult> {
  const supabase = getServiceRoleClient(
    `billing gate: deductTasks ${amount} for user ${userId}`,
  );
  const { data, error } = await supabase.rpc("deduct_tasks_if_available", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    throw new Error(`deduct_tasks_if_available RPC failed: ${error.message}`);
  }
  const response = data as DeductRpcResponse;
  return response.ok
    ? { ok: true, used: response.used, limit: response.limit }
    : { ok: false, used: response.used, limit: response.limit };
}

// ─── Reserve / reconcile wrappers (Slice 4.COST-12) ──────────────────────────
//
// Thin pass-throughs over the atomic SECURITY DEFINER RPCs added in
// 20260525000002_reserve_reconcile_billing.sql. FOUNDATION ONLY — nothing in
// the engine calls these yet (the COST-13 service layer + COST-14 engine
// integration come later, behind a flag). Live billing is unchanged. All four
// go through the service-role client (server-side, no user session) and the
// RPC is the single authoritative balance mutator (no read-then-write here).

/** reserve_tasks_if_available result. */
export interface ReserveTasksResult {
  ok: boolean;
  reason: string;
  used: number;
  reserved: number;
  limit: number;
  amount: number;
}

/** reconcile_task_reservation result. */
export interface ReconcileReservationResult {
  ok: boolean;
  reason: string;
  used?: number;
  reserved?: number;
  limit?: number;
  charged?: number;
  refunded?: number;
}

/** release_task_reservation result. */
export interface ReleaseReservationResult {
  ok: boolean;
  reason: string;
  reserved?: number;
  limit?: number;
  released?: number;
}

/** release_expired_reservations result. */
export interface ReleaseExpiredResult {
  ok: boolean;
  releasedCount: number;
  releasedTasks: number;
}

/** Hold `amount` tasks for `runId` (caller must have created the run row). */
export async function reserveTasks(
  userId: string,
  amount: number,
  runId: string,
  expiresAt?: string | null,
): Promise<ReserveTasksResult> {
  const supabase = getServiceRoleClient(
    `billing: reserveTasks ${amount} run ${runId} user ${userId}`,
  );
  const { data, error } = await supabase.rpc("reserve_tasks_if_available", {
    p_user_id: userId,
    p_amount: amount,
    p_run_id: runId,
    p_expires_at: expiresAt ?? null,
  });
  if (error) {
    throw new Error(`reserve_tasks_if_available RPC failed: ${error.message}`);
  }
  return data as ReserveTasksResult;
}

/** Convert `runId`'s hold into a charge of `actual` (release the remainder). */
export async function reconcileReservation(
  userId: string,
  runId: string,
  actual: number,
): Promise<ReconcileReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: reconcileReservation run ${runId} actual ${actual} user ${userId}`,
  );
  const { data, error } = await supabase.rpc("reconcile_task_reservation", {
    p_user_id: userId,
    p_run_id: runId,
    p_actual: actual,
  });
  if (error) {
    throw new Error(`reconcile_task_reservation RPC failed: ${error.message}`);
  }
  return data as ReconcileReservationResult;
}

/** Release `runId`'s full hold without charging (fatal-before-execution). */
export async function releaseReservation(
  userId: string,
  runId: string,
): Promise<ReleaseReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: releaseReservation run ${runId} user ${userId}`,
  );
  const { data, error } = await supabase.rpc("release_task_reservation", {
    p_user_id: userId,
    p_run_id: runId,
  });
  if (error) {
    throw new Error(`release_task_reservation RPC failed: ${error.message}`);
  }
  return data as ReleaseReservationResult;
}

/** Sweep orphaned holds past their expiry (service/cron intended). */
export async function releaseExpiredReservations(
  now?: string,
): Promise<ReleaseExpiredResult> {
  const supabase = getServiceRoleClient(
    "billing: releaseExpiredReservations sweep",
  );
  const { data, error } = await supabase.rpc("release_expired_reservations", {
    p_now: now ?? new Date().toISOString(),
  });
  if (error) {
    throw new Error(`release_expired_reservations RPC failed: ${error.message}`);
  }
  const row = data as { released_count: number; released_tasks: number; ok: boolean };
  return {
    ok: row.ok,
    releasedCount: row.released_count,
    releasedTasks: row.released_tasks,
  };
}

export interface UserBillingUsage {
  tasksUsed: number;
  tasksLimit: number;
  periodStartedAt: string;
}

interface UserBillingRow {
  tasks_used: number;
  tasks_limit: number;
  period_started_at: string;
}

export async function getUsage(userId: string): Promise<UserBillingUsage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_billing")
    .select("tasks_used, tasks_limit, period_started_at")
    .eq("user_id", userId)
    .maybeSingle<UserBillingRow>();
  if (error) {
    throw new Error(`user_billing.getUsage failed: ${error.message}`);
  }
  if (!data) return null;
  return {
    tasksUsed: data.tasks_used,
    tasksLimit: data.tasks_limit,
    periodStartedAt: data.period_started_at,
  };
}
