/**
 * Crons monitored by the ops-alert evaluator (Phase 8b), with their expected
 * cadence (minutes). A cron whose newest heartbeat is older than
 * `expectedIntervalMinutes × cronMissingMultiplier` — or has no heartbeat — trips
 * a missing-run alert; an explicit `failed` heartbeat trips a failure alert.
 *
 * Source of truth for the cadence is vercel.json. `evaluate-ops-alerts` monitors
 * itself (its own heartbeat) so a dead evaluator is visible on the next live tick.
 * Keep this list in sync when crons are added/removed in vercel.json.
 */

export interface MonitoredCron {
  name: string;
  expectedIntervalMinutes: number;
}

export const MONITORED_CRONS: readonly MonitoredCron[] = [
  { name: "poll-triggers", expectedIntervalMinutes: 1 },
  { name: "run-scheduled-triggers", expectedIntervalMinutes: 1 },
  { name: "renew-watch-subscriptions", expectedIntervalMinutes: 10 },
  { name: "sweep-stale-runs", expectedIntervalMinutes: 10 },
  { name: "process-run-queue", expectedIntervalMinutes: 1 },
  { name: "release-expired-reservations", expectedIntervalMinutes: 10 },
  { name: "check-slack-health", expectedIntervalMinutes: 360 },
  { name: "cleanup-workflow-files", expectedIntervalMinutes: 1440 },
  { name: "evaluate-ops-alerts", expectedIntervalMinutes: 5 },
  { name: "refresh-oauth-tokens", expectedIntervalMinutes: 10 },
  // ACCOUNT-BILLING-LIFECYCLE-2/3 — hourly (vercel.json `0 * * * *`). A missing tick means
  // departing customers whose Stripe cancellation failed keep being billed with nothing
  // retrying, so this cron going quiet is itself the alert-worthy condition.
  { name: "reconcile-deletion-billing", expectedIntervalMinutes: 60 },
];
