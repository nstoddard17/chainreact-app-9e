import { computeTaskUsageView } from "./taskUsagePeriod";

/**
 * Consolidated, display-safe account usage summary (Slice 4.BILLING-USAGE-VISIBILITY-1).
 *
 * One pure function that folds the two independent billing dimensions — workflow
 * TASKS and AI CREDITS — into a single shape the account/billing UI can render
 * directly: used / limit / remaining / percent, plus derived near-limit and
 * over-limit booleans and the next reset boundary. It reuses
 * {@link computeTaskUsageView} for the lazy-rollover period math, so the displayed
 * "current period" matches exactly what the deduct/reserve RPCs enforce.
 *
 * Pure: every input (including `now`) is passed in — no clock read, no I/O. The
 * caller (a membership-scoped server component) is responsible for authorization;
 * this helper only shapes already-authorized facts.
 *
 * Display-SAFE by construction: it carries only counts, a coarse `billingMode`
 * display status, and booleans. It never sees or emits Stripe customer/subscription
 * ids, the internal audit reason, raw ledger rows, or any other privileged field.
 */

/**
 * Fraction-of-limit at/above which a usage dimension is surfaced as "near limit".
 * No central policy threshold exists yet, so this is the SINGLE local source of the
 * number; bump here if product later defines an official warning threshold.
 */
export const USAGE_NEAR_LIMIT_THRESHOLD = 0.8;

/** Coarse, display-only billing status. `internal_free` = an internal/non-billed
 *  account (usage is still tracked); it is NOT a Stripe/subscription state. */
export type BillingDisplayMode = "standard" | "internal_free";

export interface UsageDimensionInput {
  used: number;
  limit: number;
  /** ISO period anchor (`*_period_started_at`); null when unknown. */
  periodStartedAt: string | null;
}

export interface UsageDimensionSummary {
  /** False when the dimension's data was unavailable (caller renders an honest
   *  "unavailable" state, never faked zeros that look like real usage). */
  available: boolean;
  /** Effective current-period used (0 after a pending lazy rollover). */
  used: number;
  limit: number;
  /** `max(0, limit − used)`. */
  remaining: number;
  /** Whole-number percent of limit used (0–100, clamped); 0 when limit ≤ 0. */
  percentUsed: number;
  /** At/over the near-limit threshold but not yet exhausted. */
  nearLimit: boolean;
  /** No remaining in the effective current period. */
  overLimit: boolean;
  /** Next reset boundary ISO (period start + 1 month), or null when unknown. */
  resetsAt: string | null;
}

export interface AccountUsageSummaryInput {
  billingMode: BillingDisplayMode;
  /** Task usage facts, or null when the billing row / read was unavailable. */
  tasks: UsageDimensionInput | null;
  /** AI-credit usage facts, or null when unavailable. */
  aiCredits: UsageDimensionInput | null;
  now: Date;
}

export interface AccountUsageSummary {
  billingMode: BillingDisplayMode;
  /** Convenience flag: this account is internal and tracked-but-not-billed. */
  internalFree: boolean;
  tasks: UsageDimensionSummary;
  aiCredits: UsageDimensionSummary;
}

const UNAVAILABLE: UsageDimensionSummary = {
  available: false,
  used: 0,
  limit: 0,
  remaining: 0,
  percentUsed: 0,
  nearLimit: false,
  overLimit: false,
  resetsAt: null,
};

function summarizeDimension(
  dim: UsageDimensionInput | null,
  now: Date,
): UsageDimensionSummary {
  if (!dim) return UNAVAILABLE;
  // Reuse the lazy-rollover period view so used/remaining/reset match enforcement.
  const view = computeTaskUsageView({
    tasksUsed: dim.used,
    tasksLimit: dim.limit,
    periodStartedAt: dim.periodStartedAt,
    now,
  });
  const limit = view.tasksLimit;
  const used = view.tasksUsed;
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const overLimit = view.exhausted;
  const nearLimit = !overLimit && limit > 0 && used / limit >= USAGE_NEAR_LIMIT_THRESHOLD;
  return {
    available: true,
    used,
    limit,
    remaining: view.tasksRemaining,
    percentUsed,
    nearLimit,
    overLimit,
    resetsAt: view.resetsAt,
  };
}

export function computeAccountUsageSummary(
  input: AccountUsageSummaryInput,
): AccountUsageSummary {
  return {
    billingMode: input.billingMode,
    internalFree: input.billingMode === "internal_free",
    tasks: summarizeDimension(input.tasks, input.now),
    aiCredits: summarizeDimension(input.aiCredits, input.now),
  };
}
