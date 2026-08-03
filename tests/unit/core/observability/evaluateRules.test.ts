/** @jest-environment node */
/**
 * Tests for core/observability/evaluateRules — the pure ops-alert rules.
 *
 * Matrix (per docs/rules/testing-strategy.md):
 *  - good path: an all-clear snapshot produces ZERO candidates.
 *  - bad path: each category at/over threshold produces exactly one typed candidate.
 *  - state integrity / no-leak: serialized candidates contain no secret-shaped strings.
 *
 * Business rule: an owner is alerted only when a real launch-readiness condition
 * breaches its conservative threshold — never on low-volume noise, never green-washed.
 */
import { evaluateOpsAlertRules } from "@/core/observability/evaluateRules";
import { DEFAULT_OPS_ALERT_THRESHOLDS } from "@/core/observability/alertThresholds";
import type { OpsSignalsSnapshot } from "@/contracts/opsAlert";

const T = DEFAULT_OPS_ALERT_THRESHOLDS;

/** All-clear baseline: nothing breaches; queue monitored + empty. */
function clearSnapshot(): OpsSignalsSnapshot {
  return {
    nowIso: "2026-06-26T00:00:00.000Z",
    stuckRuns: { count: 0, oldestAgeMinutes: null },
    queue: { monitored: true, depth: 0, oldestAgeMinutes: null },
    providerFailures: [],
    oauthRefreshFailures: [],
    billingWebhookFailures: { totalFailures: 0, signatureFailures: 0 },
    cronStatuses: [
      {
        name: "poll-triggers",
        lastOutcome: "ok",
        lastSuccessAgeMinutes: 1,
        consecutiveFailures: 0,
        expectedIntervalMinutes: 1,
      },
    ],
  };
}

describe("evaluateOpsAlertRules — good path", () => {
  it("fires zero candidates when nothing breaches", () => {
    expect(evaluateOpsAlertRules(clearSnapshot(), T)).toEqual([]);
  });
});

describe("evaluateOpsAlertRules — bad path per category", () => {
  it("stuck runs: count over min + old age → critical stuck_runs", () => {
    const s = clearSnapshot();
    s.stuckRuns = { count: T.stuckRunMinCount, oldestAgeMinutes: T.stuckRunCritMinutes };
    const found = evaluateOpsAlertRules(s, T);
    expect(found).toHaveLength(1);
    expect(found[0]!.category).toBe("stuck_runs");
    expect(found[0]!.severity).toBe("critical");
    expect(found[0]!.dedupeKey).toBe("stuck_runs");
  });

  it("stuck runs below min count → no alert", () => {
    const s = clearSnapshot();
    s.stuckRuns = { count: T.stuckRunMinCount - 1, oldestAgeMinutes: 120 };
    expect(evaluateOpsAlertRules(s, T)).toEqual([]);
  });

  it("queue backlog: depth + age over threshold → critical queue_backlog", () => {
    const s = clearSnapshot();
    s.queue = { monitored: true, depth: T.queueDepthMax + 1, oldestAgeMinutes: T.queueOldestAgeMinutes + 1 };
    const found = evaluateOpsAlertRules(s, T);
    expect(found).toHaveLength(1);
    expect(found[0]!.category).toBe("queue_backlog");
    expect(found[0]!.severity).toBe("critical");
  });

  it("queue UNMONITORED fires nothing even with a huge backlog (never green, never proxy)", () => {
    const s = clearSnapshot();
    s.queue = { monitored: false, depth: 99999, oldestAgeMinutes: 99999 };
    expect(evaluateOpsAlertRules(s, T)).toEqual([]);
  });

  it("provider failure rate: over volume floor + over rate → provider_failure_rate per provider", () => {
    const s = clearSnapshot();
    s.providerFailures = [
      { provider: "slack", attempts: T.providerFailMinVolume, failures: T.providerFailMinVolume }, // 100%
      { provider: "gmail", attempts: 5, failures: 5 }, // below volume floor → ignored
    ];
    const found = evaluateOpsAlertRules(s, T);
    expect(found).toHaveLength(1);
    expect(found[0]!.category).toBe("provider_failure_rate");
    expect(found[0]!.dedupeKey).toBe("provider_failure_rate:slack");
    expect(found[0]!.severity).toBe("critical"); // 100% >= 80%
  });

  it("provider failure rate respects the volume floor (no low-N noise)", () => {
    const s = clearSnapshot();
    s.providerFailures = [{ provider: "slack", attempts: T.providerFailMinVolume - 1, failures: 100 }];
    expect(evaluateOpsAlertRules(s, T)).toEqual([]);
  });

  it("oauth refresh failures: enough affected integrations → oauth_refresh_failures per provider", () => {
    const s = clearSnapshot();
    s.oauthRefreshFailures = [{ provider: "google", affectedCount: T.oauthFailMinCount }];
    const found = evaluateOpsAlertRules(s, T);
    expect(found).toHaveLength(1);
    expect(found[0]!.category).toBe("oauth_refresh_failures");
    expect(found[0]!.dedupeKey).toBe("oauth_refresh_failures:google");
    expect(found[0]!.recommendedAction).toMatch(/reconnect/i);
  });

  it("billing webhook: signature burst → critical, processing failures → warning (distinct keys)", () => {
    const s = clearSnapshot();
    s.billingWebhookFailures = {
      totalFailures: T.billingWebhookFailCount,
      signatureFailures: T.billingWebhookSigBurst,
    };
    const found = evaluateOpsAlertRules(s, T);
    const keys = found.map((f) => f.dedupeKey).sort();
    expect(keys).toEqual([
      "billing_webhook_failures:processing",
      "billing_webhook_failures:signature",
    ]);
    expect(found.find((f) => f.dedupeKey.endsWith("signature"))!.severity).toBe("critical");
  });

  it("cron failures: explicit failure → cron_failures; missing run also trips", () => {
    const s = clearSnapshot();
    s.cronStatuses = [
      {
        name: "sweep-stale-runs",
        lastOutcome: "failed",
        lastSuccessAgeMinutes: 5,
        consecutiveFailures: 1,
        expectedIntervalMinutes: 10,
      },
      {
        name: "poll-triggers",
        lastOutcome: "ok",
        lastSuccessAgeMinutes: 10, // > 1 * 3 → missing
        consecutiveFailures: 0,
        expectedIntervalMinutes: 1,
      },
    ];
    const found = evaluateOpsAlertRules(s, T);
    expect(found.map((f) => f.dedupeKey).sort()).toEqual([
      "cron_failures:poll-triggers",
      "cron_failures:sweep-stale-runs",
    ]);
  });

  it("cron with null last success (never observed) is treated as missing", () => {
    const s = clearSnapshot();
    s.cronStatuses = [
      {
        name: "evaluate-ops-alerts",
        lastOutcome: null,
        lastSuccessAgeMinutes: null,
        consecutiveFailures: 0,
        expectedIntervalMinutes: 5,
      },
    ];
    const found = evaluateOpsAlertRules(s, T);
    expect(found).toHaveLength(1);
    expect(found[0]!.category).toBe("cron_failures");
  });
});

describe("evaluateOpsAlertRules — no secret leakage", () => {
  it("candidate payloads contain only safe ids/counts, no token/payload shapes", () => {
    const s = clearSnapshot();
    s.stuckRuns = { count: 5, oldestAgeMinutes: 40 };
    s.providerFailures = [{ provider: "slack", attempts: 50, failures: 49 }];
    s.oauthRefreshFailures = [{ provider: "google", affectedCount: 9 }];
    s.billingWebhookFailures = { totalFailures: 4, signatureFailures: 6 };
    s.cronStatuses = [
      { name: "poll-triggers", lastOutcome: "failed", lastSuccessAgeMinutes: 99, consecutiveFailures: 4, expectedIntervalMinutes: 1 },
    ];
    const serialized = JSON.stringify(evaluateOpsAlertRules(s, T));
    // Common secret/payload shapes must never appear.
    expect(serialized).not.toMatch(/xox[bap]-/i); // slack tokens
    expect(serialized).not.toMatch(/\bsk-/); // openai-style keys
    expect(serialized).not.toMatch(/gh[opsu]_/); // github tokens
    expect(serialized).not.toMatch(/Bearer\s/);
    expect(serialized).not.toMatch(/whsec_/); // stripe webhook secret
    expect(serialized).not.toMatch(/@/); // no emails
  });
});
