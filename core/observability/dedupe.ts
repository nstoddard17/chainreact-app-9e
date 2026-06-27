import {
  OPS_ALERT_SEVERITY_RANK,
  type OpsAlertCandidate,
  type OpsAlertEventRecord,
} from "@/contracts/opsAlert";

/**
 * Pure dedupe / cooldown decision (Phase 8b). Given a breaching candidate and the
 * current open alert row for its dedupe key (or null), decide whether to fire a
 * new alert, re-deliver an existing one (cooldown elapsed or severity escalated),
 * or suppress delivery (within cooldown — just bump occurrence counters).
 *
 * No clock, no DB — `nowMs` is passed in. This is what prevents alert spam: the
 * same breaching condition on every 5-minute tick delivers at most once per
 * cooldown window. See docs/slices/phase-8/launch-alerts-audit-plan.md §3.
 */

export type DedupeDecision =
  /** No open row for this key → insert a new open alert and deliver. */
  | { action: "fire" }
  /** Open row exists; cooldown elapsed or severity escalated → re-deliver + bump. */
  | { action: "deliver"; escalated: boolean }
  /** Open row exists within cooldown → bump occurrence/lastSeen only, no delivery. */
  | { action: "suppress" };

export function decideDedupe(params: {
  candidate: OpsAlertCandidate;
  existingOpen: OpsAlertEventRecord | null;
  nowMs: number;
  cooldownMinutes: number;
}): DedupeDecision {
  const { candidate, existingOpen, nowMs, cooldownMinutes } = params;
  if (!existingOpen) return { action: "fire" };

  const escalated =
    OPS_ALERT_SEVERITY_RANK[candidate.severity] >
    OPS_ALERT_SEVERITY_RANK[existingOpen.severity];
  if (escalated) return { action: "deliver", escalated: true };

  const lastDeliveredMs = existingOpen.lastDeliveredAt
    ? Date.parse(existingOpen.lastDeliveredAt)
    : null;
  const cooldownMs = cooldownMinutes * 60_000;
  const cooldownElapsed =
    lastDeliveredMs === null || nowMs - lastDeliveredMs >= cooldownMs;

  if (cooldownElapsed) return { action: "deliver", escalated: false };
  return { action: "suppress" };
}

/**
 * Open alerts whose dedupe key is NOT in the current candidate set are stale —
 * their breaching condition cleared. The evaluator marks these `resolved`.
 * Pure set difference; returns the records to resolve.
 */
export function selectResolvedAlerts(
  openAlerts: readonly OpsAlertEventRecord[],
  currentCandidates: readonly OpsAlertCandidate[],
): OpsAlertEventRecord[] {
  const activeKeys = new Set(currentCandidates.map((c) => c.dedupeKey));
  return openAlerts.filter((a) => !activeKeys.has(a.dedupeKey));
}
