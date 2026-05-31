import * as accountBillingRepo from "@/repositories/accountBilling";
import { isReserveReconcileEnabled } from "./billingFeatureFlags";

/**
 * Reserve/Reconcile billing SERVICE LAYER (Slice 4.COST-13).
 *
 * Typed application primitives over the COST-12 atomic RPCs (via the
 * `userBilling` repo wrappers), gated by the COST-13 feature flag
 * (`ENABLE_RESERVE_RECONCILE_BILLING`, default off). This is what COST-14
 * shadow mode will call — it is NOT wired into the engine here, and live
 * billing is unchanged (flat `deduct_tasks_if_available` remains the path).
 *
 * Behavior contract:
 *  - `testMode: true` → no DB call, returns a skipped (`test_mode`) result.
 *  - flag disabled → no DB call, returns a skipped (`disabled`) result. No
 *    balance is ever mutated when disabled.
 *  - enabled + real → calls the repo RPC wrapper, maps the result faithfully.
 *  - `estimatedTasks === 0` → an explicit, idempotent zero reservation (the
 *    run still enters the reserved→reconciled lifecycle; reason
 *    `zero_reservation`).
 *  - infra/RPC throw → caught and returned as `{ ok:false, reason:'rpc_error',
 *    error }` (NOT swallowed — the message rides in the result so shadow mode
 *    can log it without execution-breaking throws).
 *
 * Results carry only ids/counts/enums/amounts + an operational error string —
 * never secrets, tokens, raw configs, or raw Supabase internals.
 *
 * The expiry sweep is intentionally NOT flag-gated: it is a janitor that
 * releases orphaned holds and is safe to run anytime (no-op when none expired),
 * so a flag rollback can't strand reserved tasks.
 */

export type BillingStatus = "reserved" | "reconciled" | "released" | "failed" | "none";

export type BillingReason =
  | "reserved"
  | "zero_reservation"
  | "already_reserved"
  | "insufficient_tasks"
  | "reconciled"
  | "already_reconciled"
  | "reconcile_over_reserve"
  | "released"
  | "already_released"
  | "nothing_to_release"
  | "run_not_found"
  | "not_reserved"
  | "swept"
  | "test_mode"
  | "disabled"
  | "rpc_error"
  | "unknown";

export interface ReservationResult {
  ok: boolean;
  skipped: boolean;
  status: BillingStatus | null;
  reason: BillingReason;
  used: number | null;
  reserved: number | null;
  limit: number | null;
  amount: number;
  error?: string;
}

export interface ReconcileResult {
  ok: boolean;
  skipped: boolean;
  status: BillingStatus | null;
  reason: BillingReason;
  used: number | null;
  reserved: number | null;
  limit: number | null;
  charged: number | null;
  refunded: number | null;
  error?: string;
}

export interface ReleaseResult {
  ok: boolean;
  skipped: boolean;
  status: BillingStatus | null;
  reason: BillingReason;
  reserved: number | null;
  limit: number | null;
  released: number | null;
  error?: string;
}

export interface SweepResult {
  ok: boolean;
  reason: BillingReason;
  releasedCount: number;
  releasedTasks: number;
  error?: string;
}

export { isReserveReconcileEnabled };

// ── helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Map an RPC reason string onto the closed BillingReason union. */
function normalizeReason(raw: string | undefined): BillingReason {
  switch (raw) {
    case "reserved":
    case "zero_reservation":
    case "already_reserved":
    case "insufficient_tasks":
    case "reconciled":
    case "already_reconciled":
    case "reconcile_over_reserve":
    case "released":
    case "already_released":
    case "nothing_to_release":
    case "run_not_found":
      return raw;
    default:
      // RPC returns `not_reserved_<status>` for a reconcile/release on a run
      // that isn't in the 'reserved' state.
      if (raw && raw.startsWith("not_reserved")) return "not_reserved";
      return "unknown";
  }
}

function statusForReason(reason: BillingReason): BillingStatus | null {
  switch (reason) {
    case "reserved":
    case "zero_reservation":
    case "already_reserved":
      return "reserved";
    case "reconciled":
    case "already_reconciled":
    case "reconcile_over_reserve":
      return "reconciled";
    case "released":
    case "already_released":
      return "released";
    case "insufficient_tasks":
      return "failed";
    default:
      return null;
  }
}

// ── inputs ───────────────────────────────────────────────────────────────────

export interface CreateReservationInput {
  /** 4.ACCOUNT-MODEL-9c: bill the workflow's owning account, not the actor. */
  accountId: string;
  /** Accepted for symmetry/logging; the RPC keys on the run (which carries workflow_id). */
  workflowId?: string | null;
  workflowRunId: string;
  estimatedTasks: number;
  expiresAt?: string | null;
  testMode?: boolean;
}

export interface ReconcileInput {
  accountId: string;
  workflowRunId: string;
  actualTasks: number;
  testMode?: boolean;
}

export interface ReleaseInput {
  accountId: string;
  workflowRunId: string;
  testMode?: boolean;
}

// ── reserve ──────────────────────────────────────────────────────────────────

export async function createBillingReservation(
  input: CreateReservationInput,
): Promise<ReservationResult> {
  const amount = Math.max(0, Math.trunc(input.estimatedTasks || 0));
  const skip = (reason: BillingReason): ReservationResult => ({
    ok: true, skipped: true, status: null, reason,
    used: null, reserved: null, limit: null, amount,
  });

  if (input.testMode) return skip("test_mode");
  if (!isReserveReconcileEnabled()) return skip("disabled");

  try {
    const r = await accountBillingRepo.reserveTasks(
      input.accountId, amount, input.workflowRunId, input.expiresAt ?? null,
    );
    let reason = normalizeReason(r.reason);
    // Explicit zero reservation: a fresh reserve of 0 is a real, idempotent
    // lifecycle entry, surfaced distinctly from a non-zero hold.
    if (amount === 0 && reason === "reserved") reason = "zero_reservation";
    return {
      ok: r.ok,
      skipped: false,
      status: statusForReason(reason),
      reason,
      used: r.used ?? null,
      reserved: r.reserved ?? null,
      limit: r.limit ?? null,
      amount,
    };
  } catch (err) {
    return {
      ok: false, skipped: false, status: null, reason: "rpc_error",
      used: null, reserved: null, limit: null, amount, error: errMsg(err),
    };
  }
}

// ── reconcile ────────────────────────────────────────────────────────────────

export async function reconcileBillingReservation(
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const skip = (reason: BillingReason): ReconcileResult => ({
    ok: true, skipped: true, status: null, reason,
    used: null, reserved: null, limit: null, charged: null, refunded: null,
  });

  if (input.testMode) return skip("test_mode");
  if (!isReserveReconcileEnabled()) return skip("disabled");

  const actual = Math.max(0, Math.trunc(input.actualTasks || 0));
  try {
    const r = await accountBillingRepo.reconcileReservation(
      input.accountId, input.workflowRunId, actual,
    );
    const reason = normalizeReason(r.reason);
    return {
      ok: r.ok,
      skipped: false,
      status: statusForReason(reason),
      reason,
      used: r.used ?? null,
      reserved: r.reserved ?? null,
      limit: r.limit ?? null,
      charged: r.charged ?? null,
      refunded: r.refunded ?? null,
    };
  } catch (err) {
    return {
      ok: false, skipped: false, status: null, reason: "rpc_error",
      used: null, reserved: null, limit: null, charged: null, refunded: null,
      error: errMsg(err),
    };
  }
}

// ── release ──────────────────────────────────────────────────────────────────

export async function releaseBillingReservation(
  input: ReleaseInput,
): Promise<ReleaseResult> {
  const skip = (reason: BillingReason): ReleaseResult => ({
    ok: true, skipped: true, status: null, reason,
    reserved: null, limit: null, released: null,
  });

  if (input.testMode) return skip("test_mode");
  if (!isReserveReconcileEnabled()) return skip("disabled");

  try {
    const r = await accountBillingRepo.releaseReservation(
      input.accountId, input.workflowRunId,
    );
    const reason = normalizeReason(r.reason);
    return {
      ok: r.ok,
      skipped: false,
      status: statusForReason(reason),
      reason,
      reserved: r.reserved ?? null,
      limit: r.limit ?? null,
      released: r.released ?? null,
    };
  } catch (err) {
    return {
      ok: false, skipped: false, status: null, reason: "rpc_error",
      reserved: null, limit: null, released: null, error: errMsg(err),
    };
  }
}

// ── expiry sweep (NOT flag-gated — janitor, safe anytime) ─────────────────────

export async function releaseExpiredBillingReservations(
  input: { now?: string } = {},
): Promise<SweepResult> {
  try {
    const r = await accountBillingRepo.releaseExpiredReservations(input.now);
    return {
      ok: r.ok,
      reason: "swept",
      releasedCount: r.releasedCount,
      releasedTasks: r.releasedTasks,
    };
  } catch (err) {
    return {
      ok: false, reason: "rpc_error", releasedCount: 0, releasedTasks: 0,
      error: errMsg(err),
    };
  }
}
