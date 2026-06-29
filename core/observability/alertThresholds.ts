/**
 * Ops-alert thresholds (Phase 8b). Conservative defaults, each overridable via
 * env so launch tuning needs no code change. Pure: `resolveOpsAlertThresholds`
 * takes an env bag (defaults to `process.env`) and never throws — an invalid /
 * missing value falls through to the default.
 *
 * See docs/slices/phase-8/launch-alerts-audit-plan.md §4.
 */

export interface OpsAlertThresholds {
  /** Stuck `running` run age (minutes) for warning / critical, + min count to alert. */
  stuckRunWarnMinutes: number;
  stuckRunCritMinutes: number;
  stuckRunMinCount: number;

  /** Durable-queue depth + oldest-queued age (minutes) that trip a backlog alert. */
  queueDepthMax: number;
  queueOldestAgeMinutes: number;

  /** Provider failure-rate window + volume floor + percent that trip an alert. */
  providerFailWindowMinutes: number;
  providerFailMinVolume: number;
  providerFailRatePct: number;

  /** OAuth refresh-failure window + min distinct integrations per provider. */
  oauthFailWindowMinutes: number;
  oauthFailMinCount: number;

  /** Billing webhook failure count/window + signature-burst count/window. */
  billingWebhookFailCount: number;
  billingWebhookFailWindowMinutes: number;
  billingWebhookSigBurst: number;
  billingWebhookSigWindowMinutes: number;

  /** Cron: missing-run multiplier (× expected interval) + consecutive-failure trip. */
  cronMissingMultiplier: number;
  cronConsecutiveFailures: number;

  /** Re-deliver an open alert at most this often (minutes) unless severity escalates. */
  alertCooldownMinutes: number;
}

export const DEFAULT_OPS_ALERT_THRESHOLDS: OpsAlertThresholds = {
  stuckRunWarnMinutes: 15,
  stuckRunCritMinutes: 30,
  stuckRunMinCount: 3,

  queueDepthMax: 100,
  queueOldestAgeMinutes: 10,

  providerFailWindowMinutes: 15,
  providerFailMinVolume: 20,
  providerFailRatePct: 50,

  oauthFailWindowMinutes: 60,
  oauthFailMinCount: 5,

  billingWebhookFailCount: 3,
  billingWebhookFailWindowMinutes: 60,
  billingWebhookSigBurst: 5,
  billingWebhookSigWindowMinutes: 10,

  cronMissingMultiplier: 3,
  cronConsecutiveFailures: 3,

  alertCooldownMinutes: 60,
};

type EnvBag = Record<string, string | undefined>;

const ENV_KEYS: Readonly<Record<keyof OpsAlertThresholds, string>> = {
  stuckRunWarnMinutes: "OPS_ALERT_STUCK_RUN_WARN_MIN",
  stuckRunCritMinutes: "OPS_ALERT_STUCK_RUN_CRIT_MIN",
  stuckRunMinCount: "OPS_ALERT_STUCK_RUN_MIN_COUNT",
  queueDepthMax: "OPS_ALERT_QUEUE_DEPTH_MAX",
  queueOldestAgeMinutes: "OPS_ALERT_QUEUE_OLDEST_AGE_MIN",
  providerFailWindowMinutes: "OPS_ALERT_PROVIDER_FAIL_WINDOW_MIN",
  providerFailMinVolume: "OPS_ALERT_PROVIDER_FAIL_MIN_VOLUME",
  providerFailRatePct: "OPS_ALERT_PROVIDER_FAIL_RATE_PCT",
  oauthFailWindowMinutes: "OPS_ALERT_OAUTH_FAIL_WINDOW_MIN",
  oauthFailMinCount: "OPS_ALERT_OAUTH_FAIL_MIN_COUNT",
  billingWebhookFailCount: "OPS_ALERT_BILLING_WH_FAIL_COUNT",
  billingWebhookFailWindowMinutes: "OPS_ALERT_BILLING_WH_FAIL_WINDOW_MIN",
  billingWebhookSigBurst: "OPS_ALERT_BILLING_WH_SIG_BURST",
  billingWebhookSigWindowMinutes: "OPS_ALERT_BILLING_WH_SIG_WINDOW_MIN",
  cronMissingMultiplier: "OPS_ALERT_CRON_MISSING_MULTIPLIER",
  cronConsecutiveFailures: "OPS_ALERT_CRON_CONSEC_FAIL",
  alertCooldownMinutes: "OPS_ALERT_COOLDOWN_MIN",
};

/** Parse a positive number from env; undefined/invalid/≤0 → fall back to default. */
function parsePositive(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function resolveOpsAlertThresholds(
  env: EnvBag = process.env,
): OpsAlertThresholds {
  const out = {} as OpsAlertThresholds;
  for (const key of Object.keys(DEFAULT_OPS_ALERT_THRESHOLDS) as (keyof OpsAlertThresholds)[]) {
    out[key] = parsePositive(env[ENV_KEYS[key]], DEFAULT_OPS_ALERT_THRESHOLDS[key]);
  }
  return out;
}
