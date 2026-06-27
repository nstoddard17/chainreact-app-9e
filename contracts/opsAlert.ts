import { z } from "zod";

/**
 * Internal/owner operational alert contract (Phase 8b — launch alerts).
 *
 * Cross-layer types shared by the pure rules (`core/observability/*`), the
 * evaluator service + delivery (`services/observability/*`), and the repositories
 * (`repositories/opsAlertEvents.ts`, `repositories/opsSignalEvents.ts`).
 *
 * These alerts are INTERNAL launch-readiness signals for the owner/ops — NOT
 * customer-facing notifications. See docs/slices/phase-8/launch-alerts-audit-plan.md.
 *
 * NO-LEAK INVARIANT (enforced by tests): an alert carries category, severity,
 * coarse counts, safe identifiers (provider key / cron name / workflow|run|account
 * ids), the observed window, and a recommended action. It NEVER carries OAuth
 * tokens, webhook bodies, raw provider payloads, email/message contents, signed
 * URLs, Stripe raw events, scopes, stack traces, or provider error message strings.
 */

export const OPS_ALERT_CATEGORIES = [
  "stuck_runs",
  "queue_backlog",
  "provider_failure_rate",
  "oauth_refresh_failures",
  "billing_webhook_failures",
  "cron_failures",
] as const;
export type OpsAlertCategory = (typeof OPS_ALERT_CATEGORIES)[number];

export const OPS_ALERT_SEVERITIES = ["warning", "critical"] as const;
export type OpsAlertSeverity = (typeof OPS_ALERT_SEVERITIES)[number];

/**
 * Severity rank for escalation comparisons (higher = more severe). A candidate
 * whose severity outranks the existing open alert re-delivers immediately,
 * bypassing cooldown.
 */
export const OPS_ALERT_SEVERITY_RANK: Readonly<Record<OpsAlertSeverity, number>> = {
  warning: 1,
  critical: 2,
};

/**
 * Safe context value — primitives only. The rules build context from an
 * allow-list of safe keys; the no-leak test asserts nothing else slips in.
 */
export type OpsAlertContextValue = string | number | boolean | null;
export type OpsAlertContext = Readonly<Record<string, OpsAlertContextValue>>;

export const OpsAlertContextSchema: z.ZodType<OpsAlertContext> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

/**
 * A candidate alert produced by the pure rules from a signals snapshot. The
 * evaluator turns surviving candidates (after dedupe/cooldown) into delivered,
 * persisted `OpsAlertEventRecord`s.
 */
export const OpsAlertCandidateSchema = z.object({
  category: z.enum(OPS_ALERT_CATEGORIES),
  severity: z.enum(OPS_ALERT_SEVERITIES),
  /** Stable key for dedupe/cooldown: `category` + scope, e.g. `provider_failure_rate:slack`. */
  dedupeKey: z.string().min(1),
  /** Human window descriptor, e.g. `15m`, `60m`, `since last success`. */
  windowLabel: z.string().min(1),
  /** Breach magnitude (count / percent / age-minutes — category-defined). */
  count: z.number(),
  context: OpsAlertContextSchema,
  recommendedAction: z.string().min(1),
});
export type OpsAlertCandidate = z.infer<typeof OpsAlertCandidateSchema>;

export type OpsAlertStatus = "open" | "resolved";

/** Persisted alert row (and dedupe/cooldown state) — mirrors `ops_alert_events`. */
export interface OpsAlertEventRecord {
  id: string;
  category: OpsAlertCategory;
  severity: OpsAlertSeverity;
  dedupeKey: string;
  status: OpsAlertStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  windowLabel: string;
  context: OpsAlertContext;
  lastDeliveredAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Signals snapshot — the typed input the pure rules evaluate.        */
/* Built by the evaluator from repo readers; no DB types leak here.   */
/* ------------------------------------------------------------------ */

export interface StuckRunsSignal {
  /** Count of `running` rows whose `started_at` is older than the warn cutoff. */
  count: number;
  /** Age of the oldest such run, in minutes; null when none. */
  oldestAgeMinutes: number | null;
}

export interface QueueBacklogSignal {
  /**
   * False while the durable-queue substrate is not live (the `'queued'` enum is
   * not applied). When false the evaluator reports the category as
   * `unmonitored:awaiting_durable_queue` and fires NOTHING — never green.
   */
  monitored: boolean;
  depth: number;
  oldestAgeMinutes: number | null;
}

export interface ProviderFailureSignal {
  /** Provider key (e.g. `slack`) — never a display label or account id. */
  provider: string;
  attempts: number;
  failures: number;
}

export interface OAuthRefreshFailureSignal {
  provider: string;
  /** Distinct integrations that newly entered needs-reconnect in the window. */
  affectedCount: number;
}

export interface BillingWebhookFailureSignal {
  /** All processing failures (signature + bad-request + processing-error) in window. */
  totalFailures: number;
  /** Subset that were signature failures in the (shorter) burst window. */
  signatureFailures: number;
}

export interface CronStatusSignal {
  name: string;
  lastOutcome: "ok" | "failed" | null;
  lastSuccessAgeMinutes: number | null;
  consecutiveFailures: number;
  /** Expected cadence (minutes) used to detect a missing run. */
  expectedIntervalMinutes: number;
}

export interface OpsSignalsSnapshot {
  nowIso: string;
  stuckRuns: StuckRunsSignal;
  queue: QueueBacklogSignal;
  providerFailures: readonly ProviderFailureSignal[];
  oauthRefreshFailures: readonly OAuthRefreshFailureSignal[];
  billingWebhookFailures: BillingWebhookFailureSignal;
  cronStatuses: readonly CronStatusSignal[];
}
