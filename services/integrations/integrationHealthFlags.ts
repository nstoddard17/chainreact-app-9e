/**
 * Proactive integration health-check rollout flag (V2-READY-29).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/integrations/connectionSharingFlags.ts.
 *
 * DEFAULT OFF. The proactive Slack health-check sweep MUTATES state
 * (`needs_reconnect_at`) and sends user-facing in-app notifications, so it ships
 * dark behind this flag: a clean kill-switch if the classification proves noisy
 * in production. The cron route is also unscheduled (no vercel.json entry) until
 * frequency is confirmed, so even with the flag on it only runs on manual /
 * deliberate invocation until then.
 *
 * When OFF, `runSlackHealthCheck` short-circuits: it loads nothing, probes
 * nothing, mutates nothing, notifies no one — and the cron returns an
 * `enabled:false` no-op aggregate.
 */

/** Env var gating the proactive integration health-check sweep. */
export const INTEGRATION_HEALTH_CHECK_FLAG = "ENABLE_INTEGRATION_HEALTH_CHECK";

/** DEFAULT OFF. */
export function isIntegrationHealthCheckEnabled(): boolean {
  return process.env[INTEGRATION_HEALTH_CHECK_FLAG] === "true";
}
