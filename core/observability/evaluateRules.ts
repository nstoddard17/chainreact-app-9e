import type {
  OpsAlertCandidate,
  OpsSignalsSnapshot,
} from "@/contracts/opsAlert";
import type { OpsAlertThresholds } from "./alertThresholds";

/**
 * Pure ops-alert rules (Phase 8b). Maps a signals snapshot + thresholds to the
 * set of candidate alerts that currently breach. No DB, no clock, no env, no
 * side effects — fully unit-testable. The evaluator service applies dedupe /
 * cooldown / delivery on top of these candidates.
 *
 * Context objects carry SAFE fields only (counts, thresholds, provider keys, cron
 * names). Never tokens, payloads, messages, scopes, or PII — see the no-leak test.
 *
 * See docs/slices/phase-8/launch-alerts-audit-plan.md §3–§4.
 */

export function evaluateOpsAlertRules(
  snapshot: OpsSignalsSnapshot,
  thresholds: OpsAlertThresholds,
): OpsAlertCandidate[] {
  return [
    ...stuckRunCandidates(snapshot, thresholds),
    ...queueBacklogCandidates(snapshot, thresholds),
    ...providerFailureCandidates(snapshot, thresholds),
    ...oauthRefreshCandidates(snapshot, thresholds),
    ...billingWebhookCandidates(snapshot, thresholds),
    ...cronFailureCandidates(snapshot, thresholds),
  ];
}

function stuckRunCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  const { count, oldestAgeMinutes } = s.stuckRuns;
  if (count < t.stuckRunMinCount) return [];
  const critical = oldestAgeMinutes !== null && oldestAgeMinutes >= t.stuckRunCritMinutes;
  return [
    {
      category: "stuck_runs",
      severity: critical ? "critical" : "warning",
      dedupeKey: "stuck_runs",
      windowLabel: `older than ${t.stuckRunWarnMinutes}m`,
      count,
      context: {
        scope: "workflow_runs",
        stuckCount: count,
        oldestAgeMinutes: oldestAgeMinutes ?? null,
        threshold: t.stuckRunMinCount,
      },
      recommendedAction:
        "Inspect execution engine health; stale-run sweep finalizes at 60m but a rising count signals stuck dispatch.",
    },
  ];
}

function queueBacklogCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  // Unmonitored while the durable queue is not live → fire NOTHING (never green;
  // the evaluator reports the unmonitored state separately in its structured log).
  if (!s.queue.monitored) return [];
  const depthBreach = s.queue.depth > t.queueDepthMax;
  const ageBreach =
    s.queue.oldestAgeMinutes !== null && s.queue.oldestAgeMinutes > t.queueOldestAgeMinutes;
  if (!depthBreach && !ageBreach) return [];
  return [
    {
      category: "queue_backlog",
      severity: depthBreach && ageBreach ? "critical" : "warning",
      dedupeKey: "queue_backlog",
      windowLabel: "current",
      count: s.queue.depth,
      context: {
        scope: "queue",
        depth: s.queue.depth,
        depthThreshold: t.queueDepthMax,
        oldestAgeMinutes: s.queue.oldestAgeMinutes ?? null,
        ageThresholdMinutes: t.queueOldestAgeMinutes,
      },
      recommendedAction:
        "Check the run-queue processor cron + inline drain; backlog is growing faster than it drains.",
    },
  ];
}

function providerFailureCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  const out: OpsAlertCandidate[] = [];
  for (const p of s.providerFailures) {
    if (p.attempts < t.providerFailMinVolume) continue; // volume floor → no low-N noise
    const ratePct = p.attempts === 0 ? 0 : (p.failures / p.attempts) * 100;
    if (ratePct <= t.providerFailRatePct) continue;
    out.push({
      category: "provider_failure_rate",
      severity: ratePct >= 80 ? "critical" : "warning",
      dedupeKey: `provider_failure_rate:${p.provider}`,
      windowLabel: `${t.providerFailWindowMinutes}m`,
      count: p.failures,
      context: {
        provider: p.provider,
        attempts: p.attempts,
        failures: p.failures,
        ratePct: Math.round(ratePct),
        rateThresholdPct: t.providerFailRatePct,
        windowMinutes: t.providerFailWindowMinutes,
      },
      recommendedAction: `Provider "${p.provider}" is failing a high share of steps — check provider status / scopes / rate limits.`,
    });
  }
  return out;
}

function oauthRefreshCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  const out: OpsAlertCandidate[] = [];
  for (const o of s.oauthRefreshFailures) {
    if (o.affectedCount < t.oauthFailMinCount) continue;
    out.push({
      category: "oauth_refresh_failures",
      severity: "warning",
      dedupeKey: `oauth_refresh_failures:${o.provider}`,
      windowLabel: `${t.oauthFailWindowMinutes}m`,
      count: o.affectedCount,
      context: {
        provider: o.provider,
        affectedCount: o.affectedCount,
        threshold: t.oauthFailMinCount,
        windowMinutes: t.oauthFailWindowMinutes,
      },
      recommendedAction: `Multiple "${o.provider}" connections need reconnect — likely a provider-wide token/scope issue. Review /apps and provider OAuth status.`,
    });
  }
  return out;
}

function billingWebhookCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  const out: OpsAlertCandidate[] = [];
  const sigBurst = s.billingWebhookFailures.signatureFailures >= t.billingWebhookSigBurst;
  if (sigBurst) {
    out.push({
      category: "billing_webhook_failures",
      severity: "critical",
      dedupeKey: "billing_webhook_failures:signature",
      windowLabel: `${t.billingWebhookSigWindowMinutes}m`,
      count: s.billingWebhookFailures.signatureFailures,
      context: {
        kind: "signature",
        signatureFailures: s.billingWebhookFailures.signatureFailures,
        threshold: t.billingWebhookSigBurst,
        windowMinutes: t.billingWebhookSigWindowMinutes,
      },
      recommendedAction:
        "Stripe billing webhook signature failures spiking — verify STRIPE_BILLING_WEBHOOK_SECRET / endpoint config, possible misconfig or spoofing.",
    });
  }
  if (s.billingWebhookFailures.totalFailures >= t.billingWebhookFailCount) {
    out.push({
      category: "billing_webhook_failures",
      severity: "warning",
      dedupeKey: "billing_webhook_failures:processing",
      windowLabel: `${t.billingWebhookFailWindowMinutes}m`,
      count: s.billingWebhookFailures.totalFailures,
      context: {
        kind: "processing",
        totalFailures: s.billingWebhookFailures.totalFailures,
        threshold: t.billingWebhookFailCount,
        windowMinutes: t.billingWebhookFailWindowMinutes,
      },
      recommendedAction:
        "Stripe billing webhook processing is failing — plan/status sync may be stale. Check recent billing webhook logs.",
    });
  }
  return out;
}

function cronFailureCandidates(
  s: OpsSignalsSnapshot,
  t: OpsAlertThresholds,
): OpsAlertCandidate[] {
  const out: OpsAlertCandidate[] = [];
  for (const c of s.cronStatuses) {
    const explicitFail =
      c.lastOutcome === "failed" || c.consecutiveFailures >= t.cronConsecutiveFailures;
    const missingRun =
      c.lastSuccessAgeMinutes === null ||
      c.lastSuccessAgeMinutes > c.expectedIntervalMinutes * t.cronMissingMultiplier;
    if (!explicitFail && !missingRun) continue;
    out.push({
      category: "cron_failures",
      severity: explicitFail && missingRun ? "critical" : "warning",
      dedupeKey: `cron_failures:${c.name}`,
      windowLabel: "since last success",
      count: c.consecutiveFailures,
      context: {
        cronName: c.name,
        lastOutcome: c.lastOutcome,
        consecutiveFailures: c.consecutiveFailures,
        lastSuccessAgeMinutes: c.lastSuccessAgeMinutes ?? null,
        expectedIntervalMinutes: c.expectedIntervalMinutes,
        reason: explicitFail && missingRun ? "failing_and_missing" : explicitFail ? "failing" : "missing_run",
      },
      recommendedAction: `Cron "${c.name}" is failing or hasn't succeeded on schedule — check the cron logs and CRON_SECRET / route health.`,
    });
  }
  return out;
}
