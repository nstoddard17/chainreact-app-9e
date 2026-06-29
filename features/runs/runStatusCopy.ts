import type { WorkflowRunDisplayStatus } from "@/contracts/workflow";

/**
 * Helper copy for non-terminal run statuses on the /runs page (RUN-VISIBILITY-1).
 *
 * Pure + deterministic so it stays trivially testable and free of hydration
 * drift — the caller passes `nowMs` (the render-time clock) rather than this
 * module reading `Date.now()` itself.
 *
 * Terminal runs (`succeeded` / `failed`) return null: their outcome is already
 * shown by the status badge + the humanized error block, so no extra line.
 */

/**
 * How long a run may sit `queued` before we surface a gentle "taking longer than
 * usual" note. Queued runs normally drain within ~a minute (inline drain on
 * run-now + the every-minute `/api/cron/process-run-queue` safety net), so 5
 * minutes comfortably clears that window without false positives. This is a
 * user-facing reassurance signal only — NOT an alerting threshold.
 */
export const STALE_QUEUED_THRESHOLD_MS = 5 * 60 * 1000;

export function runStatusHelperCopy(
  status: WorkflowRunDisplayStatus,
  startedAtIso: string,
  nowMs: number,
): string | null {
  if (status === "queued") {
    const startedMs = Date.parse(startedAtIso);
    if (
      Number.isFinite(startedMs) &&
      nowMs - startedMs > STALE_QUEUED_THRESHOLD_MS
    ) {
      return "Still waiting to start — this is taking longer than usual.";
    }
    return "Waiting to start…";
  }
  if (status === "running") {
    return "Workflow is running…";
  }
  return null;
}

/**
 * True when a `queued` run has waited past the stale threshold — drives a
 * slightly more prominent (amber) treatment than the normal "Waiting to start…"
 * note. Terminal/running statuses are never stale-queued.
 */
export function isStaleQueued(
  status: WorkflowRunDisplayStatus,
  startedAtIso: string,
  nowMs: number,
): boolean {
  if (status !== "queued") return false;
  const startedMs = Date.parse(startedAtIso);
  return Number.isFinite(startedMs) && nowMs - startedMs > STALE_QUEUED_THRESHOLD_MS;
}
