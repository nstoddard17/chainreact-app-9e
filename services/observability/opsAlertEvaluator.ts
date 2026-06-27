import {
  type CronStatusSignal,
  type OpsAlertCandidate,
  type OpsSignalsSnapshot,
} from "@/contracts/opsAlert";
import { evaluateOpsAlertRules } from "@/core/observability/evaluateRules";
import { planAlertReconciliation } from "@/core/observability/dedupe";
import {
  isQueueBacklogMonitoringEnabled,
  resolveOpsAlertThresholds,
  type OpsAlertThresholds,
} from "@/core/observability/alertThresholds";
import * as opsAlertEvents from "@/repositories/opsAlertEvents";
import * as opsSignalEvents from "@/repositories/opsSignalEvents";
import * as opsHealthReaders from "@/repositories/opsHealthReaders";
import { MONITORED_CRONS, type MonitoredCron } from "./cronExpectations";
import { deliverOpsAlert } from "./delivery";

/**
 * Ops-alert evaluator (Phase 8b). The one cron-driven orchestrator: read signals
 * → pure rules → pure reconciliation plan → apply (fire/deliver/suppress/resolve)
 * → retention. Per-reader failures are isolated so one failing signal never aborts
 * the tick (logged as `ops.alert.reader_failed`). Delivery never throws.
 *
 * Dependencies are injectable for unit tests; `buildDefaultDeps()` wires the real
 * repos + delivery. See docs/slices/phase-8/launch-alerts-audit-plan.md §3.
 */

export interface OpsAlertEvaluatorDeps {
  nowIso: string;
  thresholds: OpsAlertThresholds;
  queueMonitoringEnabled: boolean;
  monitoredCrons: readonly MonitoredCron[];
  retentionSignalDays: number;
  retentionAlertDays: number;
  readers: {
    stuckRuns: typeof opsHealthReaders.readStuckRuns;
    providerFailures: typeof opsHealthReaders.aggregateProviderActionFailures;
    oauthRefreshFailures: typeof opsHealthReaders.readOAuthRefreshFailuresByProvider;
    queueBacklog: typeof opsHealthReaders.readQueueBacklog;
    cronRunStatuses: typeof opsSignalEvents.getCronRunStatuses;
    billingWebhookFailures: typeof opsSignalEvents.countBillingWebhookFailures;
  };
  alerts: {
    listOpen: typeof opsAlertEvents.listOpen;
    fireOpen: typeof opsAlertEvents.fireOpen;
    touch: typeof opsAlertEvents.touch;
    resolve: typeof opsAlertEvents.resolve;
  };
  retention: {
    deleteSignalsOlderThan: typeof opsSignalEvents.deleteOlderThan;
    deleteResolvedAlertsOlderThan: typeof opsAlertEvents.deleteResolvedOlderThan;
  };
  deliver: typeof deliverOpsAlert;
}

export interface OpsAlertEvaluationSummary {
  fired: number;
  delivered: number;
  suppressed: number;
  resolved: number;
  queueMonitored: boolean;
  candidateCount: number;
  readerErrors: string[];
  retention: { signalsDeleted: number; alertsDeleted: number };
}

function minutesAgoIso(nowMs: number, minutes: number): string {
  return new Date(nowMs - minutes * 60_000).toISOString();
}

function daysAgoIso(nowMs: number, days: number): string {
  return new Date(nowMs - days * 86_400_000).toISOString();
}

/**
 * Gather all signals, isolating each reader: a thrown reader contributes a SAFE
 * default for its slice + an entry in `readerErrors` (so the category degrades to
 * "no signal", never a false alert and never a crash).
 */
async function buildSnapshot(
  deps: OpsAlertEvaluatorDeps,
  readerErrors: string[],
): Promise<OpsSignalsSnapshot> {
  const nowMs = Date.parse(deps.nowIso);
  const t = deps.thresholds;

  async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      readerErrors.push(label);
      console.error(
        JSON.stringify({
          event: "ops.alert.reader_failed",
          reader: label,
          error: err instanceof Error ? err.message : "unknown",
        }),
      );
      return fallback;
    }
  }

  const stuckRuns = await safe(
    "stuckRuns",
    () => deps.readers.stuckRuns(minutesAgoIso(nowMs, t.stuckRunWarnMinutes), deps.nowIso),
    { count: 0, oldestAgeMinutes: null },
  );
  const providerFailures = await safe(
    "providerFailures",
    () => deps.readers.providerFailures(minutesAgoIso(nowMs, t.providerFailWindowMinutes)),
    [],
  );
  const oauthRefreshFailures = await safe(
    "oauthRefreshFailures",
    () => deps.readers.oauthRefreshFailures(minutesAgoIso(nowMs, t.oauthFailWindowMinutes)),
    [],
  );
  const queue = await safe(
    "queueBacklog",
    () => deps.readers.queueBacklog(deps.queueMonitoringEnabled, deps.nowIso),
    // On a reader failure report UNMONITORED (never green): a depth:0 fallback with
    // monitored:true would read as a healthy-empty queue while the signal is actually
    // missing. Unmonitored + a readerErrors entry is the honest degradation.
    { monitored: false, depth: 0, oldestAgeMinutes: null },
  );
  const billingWebhookFailures = await safe(
    "billingWebhookFailures",
    () =>
      deps.readers.billingWebhookFailures(
        minutesAgoIso(nowMs, t.billingWebhookFailWindowMinutes),
        minutesAgoIso(nowMs, t.billingWebhookSigWindowMinutes),
      ),
    { totalFailures: 0, signatureFailures: 0 },
  );

  const cronReadings = await safe(
    "cronRunStatuses",
    () => deps.readers.cronRunStatuses(deps.monitoredCrons.map((c) => c.name), deps.nowIso),
    [],
  );
  const intervalByName = new Map(deps.monitoredCrons.map((c) => [c.name, c.expectedIntervalMinutes]));
  const cronStatuses: CronStatusSignal[] = cronReadings.map((r) => ({
    name: r.source,
    lastOutcome: r.lastOutcome,
    lastSuccessAgeMinutes: r.lastSuccessAgeMinutes,
    consecutiveFailures: r.consecutiveFailures,
    expectedIntervalMinutes: intervalByName.get(r.source) ?? 60,
  }));

  return {
    nowIso: deps.nowIso,
    stuckRuns,
    queue,
    providerFailures,
    oauthRefreshFailures,
    billingWebhookFailures,
    cronStatuses,
  };
}

function fireInput(candidate: OpsAlertCandidate, nowIso: string) {
  return {
    category: candidate.category,
    severity: candidate.severity,
    dedupeKey: candidate.dedupeKey,
    windowLabel: candidate.windowLabel,
    context: candidate.context,
    nowIso,
  };
}

export async function evaluateOpsAlerts(
  deps: OpsAlertEvaluatorDeps,
): Promise<OpsAlertEvaluationSummary> {
  const readerErrors: string[] = [];
  const nowMs = Date.parse(deps.nowIso);

  const snapshot = await buildSnapshot(deps, readerErrors);
  const candidates = evaluateOpsAlertRules(snapshot, deps.thresholds);
  const openAlerts = await deps.alerts.listOpen();

  const plan = planAlertReconciliation({
    candidates,
    openAlerts,
    nowMs,
    cooldownMinutes: deps.thresholds.alertCooldownMinutes,
  });

  let fired = 0;
  let delivered = 0;

  // Fire new alerts (insert open row → deliver → stamp delivery, occurrence stays 1).
  for (const candidate of plan.toFire) {
    const record = await deps.alerts.fireOpen(fireInput(candidate, deps.nowIso));
    if (!record) continue; // concurrent tick already opened it; it owns delivery
    fired += 1;
    await deps.deliver(candidate);
    delivered += 1;
    await deps.alerts.touch({
      id: record.id,
      occurrenceCount: 1,
      severity: candidate.severity,
      context: candidate.context,
      nowIso: deps.nowIso,
      delivered: true,
    });
  }

  // Re-deliver (cooldown elapsed or escalated): deliver → bump + stamp delivery.
  for (const item of plan.toDeliver) {
    await deps.deliver(item.candidate);
    delivered += 1;
    await deps.alerts.touch({
      id: item.existing.id,
      occurrenceCount: item.existing.occurrenceCount + 1,
      severity: item.candidate.severity,
      context: item.candidate.context,
      nowIso: deps.nowIso,
      delivered: true,
    });
  }

  // Suppress within cooldown: bump occurrence + refresh context, NO delivery, keep severity.
  for (const item of plan.toSuppress) {
    await deps.alerts.touch({
      id: item.existing.id,
      occurrenceCount: item.existing.occurrenceCount + 1,
      severity: item.existing.severity,
      context: item.candidate.context,
      nowIso: deps.nowIso,
      delivered: false,
    });
  }

  const resolved = await deps.alerts.resolve(
    plan.toResolve.map((a) => a.id),
    deps.nowIso,
  );

  const signalsDeleted = await deps.retention.deleteSignalsOlderThan(
    daysAgoIso(nowMs, deps.retentionSignalDays),
  );
  const alertsDeleted = await deps.retention.deleteResolvedAlertsOlderThan(
    daysAgoIso(nowMs, deps.retentionAlertDays),
  );

  const summary: OpsAlertEvaluationSummary = {
    fired,
    delivered,
    suppressed: plan.toSuppress.length,
    resolved,
    queueMonitored: snapshot.queue.monitored,
    candidateCount: candidates.length,
    readerErrors,
    retention: { signalsDeleted, alertsDeleted },
  };

  console.info(
    JSON.stringify({
      event: "ops.alert.evaluated",
      ...summary,
      // Honest queue state: when unmonitored, report it — never imply OK.
      queue: snapshot.queue.monitored ? "monitored" : "unmonitored:awaiting_durable_queue",
    }),
  );

  return summary;
}

/** Wire the real repos + delivery. `nowIso` is captured by the caller (the route). */
export function buildDefaultDeps(
  nowIso: string,
  env: Record<string, string | undefined> = process.env,
): OpsAlertEvaluatorDeps {
  return {
    nowIso,
    thresholds: resolveOpsAlertThresholds(env),
    queueMonitoringEnabled: isQueueBacklogMonitoringEnabled(env),
    monitoredCrons: MONITORED_CRONS,
    retentionSignalDays: parsePositiveDays(env.OPS_SIGNAL_RETENTION_DAYS, 30),
    retentionAlertDays: parsePositiveDays(env.OPS_ALERT_RETENTION_DAYS, 90),
    readers: {
      stuckRuns: opsHealthReaders.readStuckRuns,
      providerFailures: opsHealthReaders.aggregateProviderActionFailures,
      oauthRefreshFailures: opsHealthReaders.readOAuthRefreshFailuresByProvider,
      queueBacklog: opsHealthReaders.readQueueBacklog,
      cronRunStatuses: opsSignalEvents.getCronRunStatuses,
      billingWebhookFailures: opsSignalEvents.countBillingWebhookFailures,
    },
    alerts: {
      listOpen: opsAlertEvents.listOpen,
      fireOpen: opsAlertEvents.fireOpen,
      touch: opsAlertEvents.touch,
      resolve: opsAlertEvents.resolve,
    },
    retention: {
      deleteSignalsOlderThan: opsSignalEvents.deleteOlderThan,
      deleteResolvedAlertsOlderThan: opsAlertEvents.deleteResolvedOlderThan,
    },
    deliver: deliverOpsAlert,
  };
}

function parsePositiveDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
