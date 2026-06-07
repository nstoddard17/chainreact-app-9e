import { planLimitsFor, type PlanTier } from "./planPolicy";

/**
 * Downgrade safety rules (Slice 4.BILLING-PLAN-METADATA-6 / CS-5).
 *
 * Pure (no DB / I/O). Compares an account's CURRENT usage against a TARGET plan's limits
 * and reports what would overflow. This is VALIDATION/PREVIEW only — it performs no
 * downgrade and deletes nothing. A blocked result means the user must reduce usage (remove
 * members / folders) before the lower plan is safe; the actual plan change happens in
 * Stripe (portal), gated by this check (wired by a later slice).
 *
 * Limits come from the central plan policy. A `null` target limit (enterprise =
 * uncapped) never blocks. Equality is allowed (usage == limit is fine); only usage
 * STRICTLY OVER the target limit blocks.
 */

export interface DowngradeUsage {
  /** Current total members incl. owner (1 for a personal account). */
  memberCount: number;
  /** Current live (non-trashed) folder count. */
  folderCount: number;
}

export type DowngradeBlocker =
  | { kind: "members"; current: number; limit: number }
  | { kind: "folders"; current: number; limit: number };

export interface DowngradeEvaluation {
  /** True when the account already fits within the target plan's limits. */
  ok: boolean;
  /** Each limit the current usage exceeds (empty when ok). */
  blockers: DowngradeBlocker[];
}

export function evaluateDowngrade(
  usage: DowngradeUsage,
  targetPlan: PlanTier,
): DowngradeEvaluation {
  const limits = planLimitsFor(targetPlan);
  const blockers: DowngradeBlocker[] = [];

  if (limits.memberLimit !== null && usage.memberCount > limits.memberLimit) {
    blockers.push({ kind: "members", current: usage.memberCount, limit: limits.memberLimit });
  }
  if (limits.folderLimit !== null && usage.folderCount > limits.folderLimit) {
    blockers.push({ kind: "folders", current: usage.folderCount, limit: limits.folderLimit });
  }

  return { ok: blockers.length === 0, blockers };
}
