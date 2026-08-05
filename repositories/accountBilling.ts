import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { planLimitsFor, type PlanTier, type PlanStatus } from "@/core/billing/planPolicy";
import type { RpcArgs } from "@/types/rpc";

/**
 * Atomic Team → Business upgrade (Slice 4.BILLING-BUSINESS-UPGRADE-2 / BU-1). Service-role
 * wrapper over the `apply_business_upgrade` SECURITY DEFINER RPC, which flips
 * `accounts.type` team→organization AND sets `account_billing.plan='business'` (+ status /
 * period / cancel / Stripe ids / tasks_limit) in ONE transaction. The webhook (BU-3) is the
 * only intended caller; there is no client write path. The RPC re-validates server-side and
 * is idempotent (no-op when already organization / not a team / frozen). `tasksLimit`
 * defaults to the Business policy cap so the number stays authoritative in TS, not SQL.
 */
export interface ApplyBusinessUpgradeInput {
  accountId: string;
  planStatus: PlanStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  /** Defaults to `planLimitsFor('business').taskLimit`. */
  tasksLimit?: number;
  /** Defaults to `planLimitsFor('business').aiCreditsMonthlyLimit` (AI-CREDITS-REPRICE-1). */
  aiCreditsLimit?: number;
}

export interface ApplyBusinessUpgradeResult {
  ok: boolean;
  /** True only when this call performed the flip (false on an idempotent no-op). */
  applied: boolean;
  /** upgraded | already_upgraded | account_not_found | account_frozen | not_upgradeable. */
  reason: string;
}

export async function applyBusinessUpgradeServiceRole(
  input: ApplyBusinessUpgradeInput,
): Promise<ApplyBusinessUpgradeResult> {
  const tasksLimit = input.tasksLimit ?? planLimitsFor("business").taskLimit ?? 100;
  const aiCreditsLimit =
    input.aiCreditsLimit ?? planLimitsFor("business").aiCreditsMonthlyLimit ?? 100;
  const supabase = getServiceRoleClient(
    `account upgrade: team→business for account ${input.accountId}`,
  );
  // RPC-SIGNATURE-DRIFT-GUARD-1 — checked against the generated database
  // signature at compile time; a migration that renames, adds or drops a
  // parameter breaks the build here instead of at runtime.
  const args = {
    p_account_id: input.accountId,
    p_plan_status: input.planStatus,
    p_current_period_end: input.currentPeriodEnd ?? null,
    p_cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    p_stripe_subscription_id: input.stripeSubscriptionId ?? null,
    p_stripe_customer_id: input.stripeCustomerId ?? null,
    p_tasks_limit: tasksLimit,
    p_ai_credits_limit: aiCreditsLimit,
  } satisfies RpcArgs<"apply_business_upgrade">;
  const { data, error } = await supabase.rpc("apply_business_upgrade", args);
  if (error) {
    throw new Error(`apply_business_upgrade RPC failed: ${error.message}`);
  }
  const row = data as { ok: boolean; applied: boolean; reason: string };
  return { ok: row.ok, applied: row.applied, reason: row.reason };
}

/**
 * Atomic Business → Team downgrade (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1).
 * Service-role wrapper over the `apply_business_downgrade` SECURITY DEFINER RPC — the mirror of
 * the upgrade primitive. It flips `accounts.type` organization→team AND sets
 * `account_billing.plan='team'` (+ status + tasks_limit) in ONE transaction. The owner-confirmed
 * `downgradeBusinessToTeam` orchestration is the only intended caller, and only AFTER it has
 * removed non-owner members + flattened folders; there is no client write path. The RPC
 * re-validates server-side and is idempotent (no-op `already_team`; rejects personal/frozen/
 * missing). It deliberately does NOT touch the Stripe attachment columns (the customer is kept).
 * `tasksLimit` defaults to the Team policy cap so the number stays authoritative in TS, not SQL.
 */
export interface ApplyBusinessDowngradeInput {
  accountId: string;
  planStatus: PlanStatus;
  /** Defaults to `planLimitsFor('team').taskLimit`. */
  tasksLimit?: number;
  /** Defaults to `planLimitsFor('team').aiCreditsMonthlyLimit` (AI-CREDITS-REPRICE-1). */
  aiCreditsLimit?: number;
}

export interface ApplyBusinessDowngradeResult {
  ok: boolean;
  /** True only when this call performed the flip (false on an idempotent no-op). */
  applied: boolean;
  /** downgraded | already_team | account_not_found | account_frozen | not_downgradeable. */
  reason: string;
}

export async function applyBusinessDowngradeServiceRole(
  input: ApplyBusinessDowngradeInput,
): Promise<ApplyBusinessDowngradeResult> {
  const tasksLimit = input.tasksLimit ?? planLimitsFor("team").taskLimit ?? 100;
  const aiCreditsLimit =
    input.aiCreditsLimit ?? planLimitsFor("team").aiCreditsMonthlyLimit ?? 100;
  const supabase = getServiceRoleClient(
    `account downgrade: organization→team for account ${input.accountId}`,
  );
  const { data, error } = await supabase.rpc("apply_business_downgrade", {
    p_account_id: input.accountId,
    p_plan_status: input.planStatus,
    p_tasks_limit: tasksLimit,
    p_ai_credits_limit: aiCreditsLimit,
  } satisfies RpcArgs<"apply_business_downgrade">);
  if (error) {
    throw new Error(`apply_business_downgrade RPC failed: ${error.message}`);
  }
  const row = data as { ok: boolean; applied: boolean; reason: string };
  return { ok: row.ok, applied: row.applied, reason: row.reason };
}

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
  /** Task cap written from plan policy on a plan revert (D2). Omit to leave unchanged. */
  tasksLimit?: number;
  /** AI credit cap written from plan policy alongside a plan change (AI-CREDITS-REPRICE-1).
   *  Omit to leave unchanged (custom/per-deal values survive status-only syncs). */
  aiCreditsLimit?: number;
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
  if ("tasksLimit" in fields) patch.tasks_limit = fields.tasksLimit;
  if ("aiCreditsLimit" in fields) patch.ai_credits_limit = fields.aiCreditsLimit;
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
  } satisfies RpcArgs<"deduct_tasks_if_available">);
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
  } satisfies RpcArgs<"reserve_tasks_if_available">);
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
  } satisfies RpcArgs<"reconcile_task_reservation">);
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
  } satisfies RpcArgs<"release_task_reservation">);
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
  } satisfies RpcArgs<"release_expired_reservations">);
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
  /** Subscription period end from Stripe (CS-5 surfaced); null when no subscription. */
  currentPeriodEnd: string | null;
  /** Whether the subscription is set to cancel at period end (CS-5 surfaced). */
  cancelAtPeriodEnd: boolean;
}

interface AccountBillingRow {
  tasks_used: number;
  tasks_limit: number;
  period_started_at: string;
  plan: PlanTier;
  plan_status: PlanStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
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
  // A new team/org account seeds its type's default plan (the column default 'free' is
  // correct for the trigger-seeded personal path). PRICING-LOCK enforcement: when a plan is
  // given, also stamp tasks_limit from planPolicy so the account is born with the right cap
  // (team = 7,500) instead of the column default (100). Insert-only via ignoreDuplicates, so
  // an existing billing row is never overwritten. planPolicy stays the single source of the
  // number; enterprise (taskLimit null) keeps the column default and is set per deal.
  const row: {
    account_id: string;
    plan?: PlanTier;
    tasks_limit?: number;
    ai_credits_limit?: number;
  } = {
    account_id: accountId,
  };
  if (plan) {
    row.plan = plan;
    const taskLimit = planLimitsFor(plan).taskLimit;
    if (taskLimit !== null) row.tasks_limit = taskLimit;
    // AI-CREDITS-REPRICE-1: born with the plan's AI credit cap too (team = 10,000)
    // instead of the column default (100). Enterprise (null) keeps the column
    // default and is set per deal — same posture as tasks_limit.
    const aiCreditsLimit = planLimitsFor(plan).aiCreditsMonthlyLimit;
    if (aiCreditsLimit !== null) row.ai_credits_limit = aiCreditsLimit;
  }
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
    .select(
      "tasks_used, tasks_limit, period_started_at, plan, plan_status, current_period_end, cancel_at_period_end",
    )
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
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

/**
 * Lean read of an account's CURRENT billing tier (4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-2
 * / CS-XT-1). Selects ONLY the `plan` column via the SSR-cookie / RLS client — no Stripe ids, no
 * usage, no period data ever reach the caller. Returns null when no billing row exists (caller
 * decides the fallback — `resolveAccountPlan` fails closed to "free"). This is the actual stored
 * billing plan (NOT `defaultPlanForAccountType`), which is what feature-tier gates must use so a
 * personal Pro account resolves Pro capabilities rather than the Free type default.
 */
export async function getPlan(accountId: string): Promise<PlanTier | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_billing")
    .select("plan")
    .eq("account_id", accountId)
    .maybeSingle<{ plan: PlanTier }>();
  if (error) {
    throw new Error(`account_billing.getPlan failed: ${error.message}`);
  }
  return data?.plan ?? null;
}

/** Plan tier + billing status pair for entitlement decisions (BRANCH-ENT-1). */
export interface AccountPlanState {
  plan: PlanTier;
  planStatus: PlanStatus;
}

/**
 * Lean read of an account's plan TIER + STATUS (BRANCH-ENT-1). Same posture as
 * `getPlan` (SSR-cookie / RLS client, explicit non-secret columns, null when no
 * billing row — callers fail closed), but also returns `plan_status` so capability
 * gates can distinguish a live/trialing subscription from a canceled or incomplete
 * one. Used by `services/billing/advancedBranchingEntitlement.ts` for user-context
 * boundaries (save / activate / run-now / AI routes).
 */
export async function getPlanState(
  accountId: string,
): Promise<AccountPlanState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_billing")
    .select("plan, plan_status")
    .eq("account_id", accountId)
    .maybeSingle<{ plan: PlanTier; plan_status: PlanStatus }>();
  if (error) {
    throw new Error(`account_billing.getPlanState failed: ${error.message}`);
  }
  if (!data) return null;
  return { plan: data.plan, planStatus: data.plan_status };
}

/**
 * Service-role variant of {@link getPlanState} for background execution contexts
 * (engine pre-execution gate, queue processor, webhook/polling/scheduled dispatch)
 * where no user session exists. Reads the SAME two non-secret columns — never the
 * Stripe attachment. Missing row → null (callers fail closed to denied, mirroring
 * `resolveAccountPlan`'s free fallback).
 */
export async function getPlanStateServiceRole(
  accountId: string,
): Promise<AccountPlanState | null> {
  const supabase = getServiceRoleClient(
    `account_billing: read plan state for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .select("plan, plan_status")
    .eq("account_id", accountId)
    .maybeSingle<{ plan: PlanTier; plan_status: PlanStatus }>();
  if (error) {
    throw new Error(
      `account_billing.getPlanStateServiceRole failed: ${error.message}`,
    );
  }
  if (!data) return null;
  return { plan: data.plan, planStatus: data.plan_status };
}

// ─── Internal billing entitlement (BIE-1) — service-role ONLY ────────────────
//
// `billing_mode` marks an account as `internal_free` so the execution billing
// gate skips deduction and the checkout/portal entry points skip Stripe. This is
// ACCOUNT-scoped (keyed on account_id, like every other column here) — never a
// user-level bypass. The columns are privileged flags: they are NOT part of the
// client-facing getUsage projection, and there is no client/RLS write policy, so
// the toggle is service-role only. The setter writes all four internal columns
// together to satisfy the `account_billing_internal_consistency` CHECK.

export type BillingMode = "standard" | "internal_free";

/** Allowed values for `internal_reason` (mirrors the migration CHECK set). */
export const INTERNAL_BILLING_REASONS = [
  "employee",
  "qa",
  "demo",
  "load_test",
  "partner",
  "other",
] as const;
export type InternalBillingReason = (typeof INTERNAL_BILLING_REASONS)[number];

interface BillingModeRow {
  billing_mode: BillingMode;
}

/**
 * Service-role read of an account's billing mode — used by the execution billing
 * gate and the checkout/portal entry points. A missing billing row resolves to
 * `standard` (fail-safe to BILLED enforcement; the deduct RPC self-heals the row),
 * so an absent/unknown account is never accidentally treated as internal-free.
 */
export async function getBillingModeServiceRole(
  accountId: string,
): Promise<BillingMode> {
  const supabase = getServiceRoleClient(
    `account_billing: read billing_mode for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .select("billing_mode")
    .eq("account_id", accountId)
    .maybeSingle<BillingModeRow>();
  if (error) {
    throw new Error(`account_billing.getBillingModeServiceRole failed: ${error.message}`);
  }
  return data?.billing_mode ?? "standard";
}

/**
 * Service-role: mark an account `internal_free` and stamp the audit provenance
 * (reason + who + when) in one write. Throws when no billing row exists for the
 * account (so the internal tooling / seed script reports a bad account id rather
 * than silently no-op'ing). The audit `reason` passed to the service-role client
 * records the actor for the connection log.
 */
export async function setBillingModeInternalFreeServiceRole(
  accountId: string,
  reason: InternalBillingReason,
  setByUserId: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_billing: set billing_mode=internal_free (reason=${reason}) for account ${accountId} by user ${setByUserId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .update({
      billing_mode: "internal_free",
      internal_reason: reason,
      internal_set_by_user_id: setByUserId,
      internal_set_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .select("account_id");
  if (error) {
    throw new Error(
      `account_billing.setBillingModeInternalFreeServiceRole failed: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error(
      `account_billing.setBillingModeInternalFreeServiceRole: no billing row for account ${accountId}`,
    );
  }
}

/**
 * Service-role: revert an account to `standard` billing and CLEAR all internal
 * metadata in one write (satisfies the consistency CHECK). Throws when no billing
 * row exists. After this the account flows through the normal deduction gate +
 * Stripe checkout path again.
 */
export async function revertBillingModeToStandardServiceRole(
  accountId: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_billing: revert billing_mode=standard for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .update({
      billing_mode: "standard",
      internal_reason: null,
      internal_set_by_user_id: null,
      internal_set_at: null,
    })
    .eq("account_id", accountId)
    .select("account_id");
  if (error) {
    throw new Error(
      `account_billing.revertBillingModeToStandardServiceRole failed: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error(
      `account_billing.revertBillingModeToStandardServiceRole: no billing row for account ${accountId}`,
    );
  }
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

/**
 * Compare-and-set REPLACEMENT of a stale `stripe_customer_id` (BILLING-CHECKOUT-PROD-1).
 *
 * Distinct from {@link attachStripeCustomerIfAbsentServiceRole}, which only ever fills a
 * NULL. This one repairs an attachment that Stripe itself has rejected as non-existent
 * (a customer deleted in the dashboard, or — the common cause — a customer created under
 * the OTHER Stripe mode, so a live key can never see a test-mode `cus_…`). Without a
 * repair path such an account can never check out again: every attempt re-sends the same
 * dead id and Stripe returns the same `resource_missing`.
 *
 * Guarded by `.eq("stripe_customer_id", staleCustomerId)` so it is a compare-and-set: it
 * rewrites ONLY the exact stale value the caller proved dead. A concurrent repair that
 * already won, or any other writer, leaves the row untouched and this returns
 * `replaced: false` with the effective (winner's) id — never clobbering another account
 * state. Callers MUST additionally confirm the row has no `stripe_subscription_id` before
 * repairing, so a genuinely subscribed account is never detached from its customer.
 * Service-role only.
 */
export async function replaceStaleStripeCustomerServiceRole(
  accountId: string,
  staleCustomerId: string,
  newCustomerId: string,
): Promise<{ replaced: boolean; customerId: string }> {
  const supabase = getServiceRoleClient(
    `account_billing: replace stale Stripe customer for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .update({ stripe_customer_id: newCustomerId })
    .eq("account_id", accountId)
    .eq("stripe_customer_id", staleCustomerId)
    .is("stripe_subscription_id", null)
    .select("stripe_customer_id");
  if (error) {
    throw new Error(
      `account_billing.replaceStaleStripeCustomerServiceRole failed: ${error.message}`,
    );
  }
  if (data && data.length > 0) {
    return { replaced: true, customerId: newCustomerId };
  }
  // Lost the race, or the guard rejected the repair — re-read the canonical id.
  const existing = await getStripeAttachmentServiceRole(accountId);
  return { replaced: false, customerId: existing?.stripeCustomerId ?? newCustomerId };
}

// ─── Free-trial state (PRO-TEAM-TRIAL-ENFORCEMENT-1) — service-role ONLY ──────
//
// The account-scoped record of the account's ONE free trial (across Pro and Team) and the
// atomic claim primitive. The DB is authoritative for whether the account has consumed its
// trial (`trial_consumed_at`); the claim RPC is the sole writer of that marker + origin plan.
// Reads are service-role only; the raw timestamps never reach the client (the UI uses the
// sanitized `resolveTrialOffer` boolean). Trial-eligibility (Pro/Team only) + the effective
// length live in trialPolicy / platformTrialPolicy, never here.

/** Server-only view of an account's trial state. */
export interface AccountTrialState {
  /** The permanent one-trial marker. Non-null ⇒ the account has consumed its trial. */
  consumedAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
  /** Which plan the one trial began on ('pro' | 'team'). Observability only. */
  originPlan: "pro" | "team" | null;
}

interface AccountTrialRow {
  trial_consumed_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_origin_plan: "pro" | "team" | null;
}

/**
 * Service-role read of the account's trial state. Server-only — the raw consumed/ends
 * timestamps must never be surfaced to a client (the sanitized offer boolean is derived in
 * `services/billing/platformTrialPolicy.resolveTrialOffer`). Returns null when the account has
 * no billing row.
 */
export async function getTrialStateServiceRole(
  accountId: string,
): Promise<AccountTrialState | null> {
  const supabase = getServiceRoleClient(
    `account_billing: read trial state for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_billing")
    .select("trial_consumed_at, trial_started_at, trial_ends_at, trial_origin_plan")
    .eq("account_id", accountId)
    .maybeSingle<AccountTrialRow>();
  if (error) {
    throw new Error(`account_billing.getTrialStateServiceRole failed: ${error.message}`);
  }
  if (!data) return null;
  return {
    consumedAt: data.trial_consumed_at,
    startedAt: data.trial_started_at,
    endsAt: data.trial_ends_at,
    originPlan: data.trial_origin_plan,
  };
}

export interface ClaimTrialResult {
  /** True only when THIS call consumed the account's one trial (won the atomic compare-and-set).
   *  False when the account already consumed it (or has no billing row) → subscribe without a trial. */
  claimed: boolean;
  /** The account's trial end (this call's when claimed; the pre-existing one when not — never advanced). */
  trialEndsAt: string | null;
  originPlan: "pro" | "team" | null;
}

/**
 * Atomically claim the account's ONE free trial for a server-validated Pro/Team origin plan.
 * Wraps the `claim_account_trial` SECURITY DEFINER RPC (compare-and-set on
 * `trial_consumed_at IS NULL`), so two concurrent requests / duplicate checkout submissions /
 * retries can never both receive a trial — exactly one gets `claimed: true`. The RPC RAISES on a
 * non-Pro/Team origin plan (defense in depth); callers pass only 'pro'/'team'. Service-role only;
 * there is no client claim path.
 */
export async function claimAccountTrialServiceRole(
  accountId: string,
  originPlan: "pro" | "team",
  trialEndsAt: string,
): Promise<ClaimTrialResult> {
  const supabase = getServiceRoleClient(
    `account_billing: claim one trial (origin=${originPlan}) for account ${accountId}`,
  );
  const { data, error } = await supabase.rpc("claim_account_trial", {
    p_account_id: accountId,
    p_origin_plan: originPlan,
    p_trial_ends_at: trialEndsAt,
  } satisfies RpcArgs<"claim_account_trial">);
  if (error) {
    throw new Error(`claim_account_trial RPC failed: ${error.message}`);
  }
  const row = data as {
    claimed: boolean;
    trial_ends_at: string | null;
    trial_origin_plan: "pro" | "team" | null;
  };
  return {
    claimed: row.claimed,
    trialEndsAt: row.trial_ends_at,
    originPlan: row.trial_origin_plan,
  };
}

/**
 * Service-role write of the trial WINDOW (started/ends) ONLY — used by the webhook to reconcile
 * the account's `trial_started_at` / `trial_ends_at` to Stripe's authoritative values. It NEVER
 * touches `trial_consumed_at` (the permanent one-trial marker) or `trial_origin_plan` — so a
 * webhook can never grant, restore, or re-key an account's trial eligibility, only mirror the
 * window Stripe reports for an already-claimed trial. Only provided keys are written; no-op on an
 * empty patch.
 */
export async function syncTrialWindowServiceRole(
  accountId: string,
  fields: { trialStartedAt?: string | null; trialEndsAt?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if ("trialStartedAt" in fields) patch.trial_started_at = fields.trialStartedAt ?? null;
  if ("trialEndsAt" in fields) patch.trial_ends_at = fields.trialEndsAt ?? null;
  if (Object.keys(patch).length === 0) return;

  const supabase = getServiceRoleClient(
    `account_billing: sync trial window for account ${accountId}`,
  );
  const { error } = await supabase
    .from("account_billing")
    .update(patch)
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`account_billing.syncTrialWindowServiceRole failed: ${error.message}`);
  }
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
