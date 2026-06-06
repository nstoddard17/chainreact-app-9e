import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { PlanTier, PlanStatus } from "@/core/billing/planPolicy";

/**
 * Authoritative billing-state sync from a VERIFIED Stripe billing webhook (CS-4). The
 * webhook handler is the SOLE writer of plan / plan_status — no client route may set
 * them (Q15 of the billing plan). Only the keys present on `fields` are written; a
 * missing key leaves the column untouched (so e.g. a subscription event can update
 * status + period without disturbing the plan when its metadata is incomplete).
 * Service-role only. No-op on an empty patch.
 */
export interface BillingSubscriptionSync {
  plan?: PlanTier;
  planStatus?: PlanStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export async function applyBillingSubscriptionSyncServiceRole(
  accountId: string,
  fields: BillingSubscriptionSync,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if ("plan" in fields) patch.plan = fields.plan;
  if ("planStatus" in fields) patch.plan_status = fields.planStatus;
  if ("currentPeriodEnd" in fields) patch.current_period_end = fields.currentPeriodEnd ?? null;
  if ("cancelAtPeriodEnd" in fields) patch.cancel_at_period_end = fields.cancelAtPeriodEnd;
  if ("stripeCustomerId" in fields) patch.stripe_customer_id = fields.stripeCustomerId ?? null;
  if ("stripeSubscriptionId" in fields)
    patch.stripe_subscription_id = fields.stripeSubscriptionId ?? null;
  if (Object.keys(patch).length === 0) return;

  const supabase = getServiceRoleClient(
    `account_billing: apply Stripe subscription sync for account ${accountId}`,
  );
  const { error } = await supabase
    .from("account_billing")
    .update(patch)
    .eq("account_id", accountId);
  if (error) {
    throw new Error(
      `account_billing.applyBillingSubscriptionSyncServiceRole failed: ${error.message}`,
    );
  }
}

/**
 * Repository for account_billing — the account-scoped billing root
 * (Slice 4.ACCOUNT-MODEL-9c live cutover; 9c2 canonical cleanup). Keys every
 * operation on `account_id` and calls the canonical account-keyed billing RPCs
 * (promoted from the 9b `_v2` names; the user-keyed path was removed in 9c2).
 *
 * deduct/reserve/reconcile/release/releaseExpired → service-role RPCs. The
 *   gate/engine run server-side without a user session (background execution),
 *   and the mutations must be atomic per row, so they go through the
 *   SECURITY DEFINER RPCs rather than read-modify-write.
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
  const { data, error } = await supabase.rpc("deduct_tasks_if_available", {
    p_account_id: accountId,
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

// ─── Reserve / reconcile wrappers (canonical account-keyed RPCs) ─────────────
//
// Thin pass-throughs over the atomic SECURITY DEFINER RPCs (defined account-keyed
// in 20260531000001 as `_v2`, promoted to these canonical names in 20260531000004).
// All go through the service-role client (server-side, no user session); the RPC
// is the single authoritative balance mutator (no read-then-write here).

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
  accountId: string,
  amount: number,
  runId: string,
  expiresAt?: string | null,
): Promise<ReserveTasksResult> {
  const supabase = getServiceRoleClient(
    `billing: reserveTasks ${amount} run ${runId} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("reserve_tasks_if_available", {
    p_account_id: accountId,
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
  accountId: string,
  runId: string,
  actual: number,
): Promise<ReconcileReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: reconcileReservation run ${runId} actual ${actual} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("reconcile_task_reservation", {
    p_account_id: accountId,
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
  accountId: string,
  runId: string,
): Promise<ReleaseReservationResult> {
  const supabase = getServiceRoleClient(
    `billing: releaseReservation run ${runId} account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("release_task_reservation", {
    p_account_id: accountId,
    p_run_id: runId,
  });
  if (error) {
    throw new Error(`release_task_reservation RPC failed: ${error.message}`);
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

export interface AccountBillingUsage {
  tasksUsed: number;
  tasksLimit: number;
  periodStartedAt: string;
  /** Billing tier (CS-1 plan metadata). */
  plan: PlanTier;
  /** Subscription lifecycle state (CS-1). */
  planStatus: PlanStatus;
}

interface AccountBillingRow {
  tasks_used: number;
  tasks_limit: number;
  period_started_at: string;
  plan: PlanTier;
  plan_status: PlanStatus;
}

/**
 * Service-role: initialize the free billing row for a freshly-created team/org
 * account (4.ACCOUNT-MODEL-13). All-defaults insert (tasks_limit 100, used 0,
 * reserved 0) = the FREE plan, identical to what the signup trigger seeds for a
 * personal account. No Stripe customer / subscription is created — paid-team
 * billing is deferred to the payments track. `ON CONFLICT DO NOTHING` makes a
 * re-run on a partially-created account safe.
 */
export async function initAccountBillingServiceRole(
  accountId: string,
  plan?: PlanTier,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_billing: init for account ${accountId}`,
  );
  // CS-1: a new team/org account seeds its type's default plan (the column default
  // 'free' is correct for the trigger-seeded personal path). Limits are unchanged —
  // tasks_limit still defaults to 100; `plan` is metadata only.
  const row: { account_id: string; plan?: PlanTier } = { account_id: accountId };
  if (plan) row.plan = plan;
  const { error } = await supabase
    .from("account_billing")
    .upsert(row, { onConflict: "account_id", ignoreDuplicates: true });
  if (error) {
    throw new Error(
      `account_billing.initAccountBillingServiceRole failed: ${error.message}`,
    );
  }
}

export async function getUsage(accountId: string): Promise<AccountBillingUsage | null> {
  const supabase = await createClient();
  // CLIENT-FACING projection (SSR-cookie / RLS). Selects an EXPLICIT non-secret column
  // list — `stripe_customer_id` / `stripe_subscription_id` are deliberately omitted so
  // the Stripe attachment never reaches Account Settings or any client surface (CS-2).
  // Those ids are read only via getStripeAttachmentServiceRole below (service-role).
  const { data, error } = await supabase
    .from("account_billing")
    .select("tasks_used, tasks_limit, period_started_at, plan, plan_status")
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
    plan: data.plan,
    planStatus: data.plan_status,
  };
}

// ─── Stripe attachment (CS-2) — service-role ONLY ────────────────────────────
//
// The Stripe customer/subscription ids attach platform billing to the account
// (one each per account_id, enforced by partial unique indexes in
// 20260612000000). They are NEVER part of the client-facing `getUsage` projection
// and have NO authenticated write path (account_billing has no client write
// policy) — only the future checkout/portal/webhook slices (CS-3/CS-4) read/write
// them through these service-role helpers. CS-2 adds the helpers + columns only;
// it creates no Stripe customer and wires no payment behavior.

/** Server-only view of an account's Stripe attachment. */
export interface StripeAttachment {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface StripeAttachmentRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

/**
 * Service-role read of the account's Stripe attachment. Server-only — these ids must
 * never be surfaced to a client (see the `getUsage` projection note). Returns null when
 * the account has no billing row.
 */
export async function getStripeAttachmentServiceRole(
  accountId: string,
): Promise<StripeAttachment | null> {
  const supabase = getServiceRoleClient(
    `account_billing: read Stripe attachment for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .select(
      "stripe_customer_id, stripe_subscription_id, cancel_at_period_end, current_period_end",
    )
    .eq("account_id", accountId)
    .maybeSingle<StripeAttachmentRow>();
  if (error) {
    throw new Error(
      `account_billing.getStripeAttachmentServiceRole failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return {
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    currentPeriodEnd: data.current_period_end,
  };
}

/**
 * Race-safe lazy attach of a Stripe customer id (CS-3). Writes `customerId` ONLY when
 * the account currently has none (`stripe_customer_id IS NULL`). Returns `stored: true`
 * with the written id when this caller won; on a lost race (another writer set it first,
 * or it was already set) returns `stored: false` with the EFFECTIVE (winner's) id so the
 * caller uses the canonical customer and can discard its just-created duplicate. The
 * partial unique index on `stripe_customer_id` is the final backstop. Service-role only.
 */
export async function attachStripeCustomerIfAbsentServiceRole(
  accountId: string,
  customerId: string,
): Promise<{ stored: boolean; customerId: string }> {
  const supabase = getServiceRoleClient(
    `account_billing: attach Stripe customer (if absent) for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .update({ stripe_customer_id: customerId })
    .eq("account_id", accountId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id");
  if (error) {
    throw new Error(
      `account_billing.attachStripeCustomerIfAbsentServiceRole failed: ${error.message}`,
    );
  }
  if (data && data.length > 0) {
    return { stored: true, customerId };
  }
  // Lost the race (or already attached) — re-read the canonical id.
  const existing = await getStripeAttachmentServiceRole(accountId);
  return { stored: false, customerId: existing?.stripeCustomerId ?? customerId };
}

/** Partial Stripe-attachment update (only provided fields are written). */
export interface StripeAttachmentUpdate {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
}

/**
 * Service-role write of Stripe attachment fields. Server-only; the sole write path for
 * these columns (no client/RLS write policy exists). Only keys present on `fields` are
 * updated — a missing key leaves the column untouched. No-op when `fields` is empty.
 */
export async function updateStripeAttachmentServiceRole(
  accountId: string,
  fields: StripeAttachmentUpdate,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if ("stripeCustomerId" in fields) patch.stripe_customer_id = fields.stripeCustomerId ?? null;
  if ("stripeSubscriptionId" in fields)
    patch.stripe_subscription_id = fields.stripeSubscriptionId ?? null;
  if ("cancelAtPeriodEnd" in fields) patch.cancel_at_period_end = fields.cancelAtPeriodEnd;
  if ("currentPeriodEnd" in fields) patch.current_period_end = fields.currentPeriodEnd ?? null;
  if (Object.keys(patch).length === 0) return;

  const supabase = getServiceRoleClient(
    `account_billing: update Stripe attachment for account ${accountId}`,
  );
  const { error } = await supabase
    .from("account_billing")
    .update(patch)
    .eq("account_id", accountId);
  if (error) {
    throw new Error(
      `account_billing.updateStripeAttachmentServiceRole failed: ${error.message}`,
    );
  }
}
