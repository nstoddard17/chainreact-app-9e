/**
 * Tests for services/observability/opsAlertEvaluator — orchestration.
 *
 * Matrix (per docs/rules/testing-strategy.md): good path (nothing fires), bad
 * path (a breach fires + delivers + records), missing dependency (a reader throws
 * → isolated, other categories still evaluated), upstream failure (delivery fails
 * → alert still recorded), state integrity (within-cooldown duplicate suppressed,
 * not re-delivered), and no secret leakage in the delivered payload.
 *
 * Repos + delivery are stubbed at the dependency boundary; the real rules +
 * reconciliation run.
 */
import { jest } from "@jest/globals";
import { DEFAULT_OPS_ALERT_THRESHOLDS } from "@/core/observability/alertThresholds";
import {
  evaluateOpsAlerts,
  type OpsAlertEvaluatorDeps,
} from "@/services/observability/opsAlertEvaluator";
import type { OpsAlertEventRecord } from "@/contracts/opsAlert";

const NOW = "2026-06-26T12:00:00.000Z";

function openRecord(over: Partial<OpsAlertEventRecord> = {}): OpsAlertEventRecord {
  return {
    id: "open-1",
    category: "provider_failure_rate",
    severity: "warning",
    dedupeKey: "provider_failure_rate:slack",
    status: "open",
    firstSeenAt: "2026-06-26T11:00:00.000Z",
    lastSeenAt: "2026-06-26T11:55:00.000Z",
    occurrenceCount: 2,
    windowLabel: "15m",
    context: { provider: "slack" },
    lastDeliveredAt: "2026-06-26T11:55:00.000Z",
    resolvedAt: null,
    createdAt: "2026-06-26T11:00:00.000Z",
    ...over,
  };
}

function makeDeps(over: {
  providerFailures?: { provider: string; attempts: number; failures: number }[];
  stuckRunsThrows?: boolean;
  listOpen?: OpsAlertEventRecord[];
  deliverResult?: { logged: true; webhookDelivered: boolean | null };
} = {}): {
  deps: OpsAlertEvaluatorDeps;
  spies: {
    fireOpen: jest.Mock;
    touch: jest.Mock;
    resolve: jest.Mock;
    deliver: jest.Mock;
  };
} {
  const fireOpen = jest.fn(async (input: { dedupeKey: string }) =>
    openRecord({ id: `fired-${input.dedupeKey}`, dedupeKey: input.dedupeKey, lastDeliveredAt: null }),
  );
  const touch = jest.fn(async () => undefined);
  const resolve = jest.fn(async () => 0);
  const deliver = jest.fn(async () => over.deliverResult ?? { logged: true, webhookDelivered: null });

  const deps = {
    nowIso: NOW,
    thresholds: DEFAULT_OPS_ALERT_THRESHOLDS,
    queueMonitoringEnabled: false,
    monitoredCrons: [{ name: "poll-triggers", expectedIntervalMinutes: 1 }],
    retentionSignalDays: 30,
    retentionAlertDays: 90,
    readers: {
      stuckRuns: jest.fn(async () => {
        if (over.stuckRunsThrows) throw new Error("db down");
        return { count: 0, oldestAgeMinutes: null };
      }),
      providerFailures: jest.fn(async () => over.providerFailures ?? []),
      oauthRefreshFailures: jest.fn(async () => []),
      queueBacklog: jest.fn(async () => ({ monitored: false, depth: 0, oldestAgeMinutes: null })),
      cronRunStatuses: jest.fn(async () => [
        { source: "poll-triggers", lastOutcome: "ok" as const, lastSuccessAgeMinutes: 1, consecutiveFailures: 0 },
      ]),
      billingWebhookFailures: jest.fn(async () => ({ totalFailures: 0, signatureFailures: 0 })),
    },
    alerts: {
      listOpen: jest.fn(async () => over.listOpen ?? []),
      fireOpen,
      touch,
      resolve,
    },
    retention: {
      deleteSignalsOlderThan: jest.fn(async () => 0),
      deleteResolvedAlertsOlderThan: jest.fn(async () => 0),
    },
    deliver,
  } as unknown as OpsAlertEvaluatorDeps;

  return {
    deps,
    spies: { fireOpen, touch, resolve, deliver } as unknown as {
      fireOpen: jest.Mock;
      touch: jest.Mock;
      resolve: jest.Mock;
      deliver: jest.Mock;
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("evaluateOpsAlerts", () => {
  it("good path: nothing breaches → fires/delivers nothing", async () => {
    const { deps, spies } = makeDeps();
    const summary = await evaluateOpsAlerts(deps);
    expect(summary.fired).toBe(0);
    expect(summary.delivered).toBe(0);
    expect(spies.fireOpen).not.toHaveBeenCalled();
    expect(spies.deliver).not.toHaveBeenCalled();
  });

  it("bad path: a provider breach fires a new alert, delivers it, and records it", async () => {
    const { deps, spies } = makeDeps({
      providerFailures: [{ provider: "slack", attempts: 50, failures: 49 }],
    });
    const summary = await evaluateOpsAlerts(deps);
    expect(summary.fired).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(spies.fireOpen).toHaveBeenCalledTimes(1);
    expect(spies.deliver).toHaveBeenCalledTimes(1);
    // recorded as delivered (occurrence stays 1 on fresh fire)
    expect(spies.touch).toHaveBeenCalledWith(
      expect.objectContaining({ delivered: true, occurrenceCount: 1 }),
    );
  });

  it("missing dependency: a throwing reader is isolated; other categories still evaluate", async () => {
    const { deps, spies } = makeDeps({
      stuckRunsThrows: true,
      providerFailures: [{ provider: "slack", attempts: 50, failures: 49 }],
    });
    const summary = await evaluateOpsAlerts(deps);
    expect(summary.readerErrors).toContain("stuckRuns");
    // provider category still fired despite the stuck-runs reader failing
    expect(summary.fired).toBe(1);
    expect(spies.deliver).toHaveBeenCalledTimes(1);
  });

  it("upstream failure: a failed webhook delivery still records the alert", async () => {
    const { deps, spies } = makeDeps({
      providerFailures: [{ provider: "slack", attempts: 50, failures: 49 }],
      deliverResult: { logged: true, webhookDelivered: false },
    });
    const summary = await evaluateOpsAlerts(deps);
    expect(summary.fired).toBe(1); // recorded
    expect(spies.fireOpen).toHaveBeenCalledTimes(1);
    expect(spies.touch).toHaveBeenCalled();
  });

  it("state integrity: a within-cooldown duplicate is suppressed, not re-delivered", async () => {
    const { deps, spies } = makeDeps({
      // 60% = 'warning' (matches the open alert's severity → no escalation path)
      providerFailures: [{ provider: "slack", attempts: 50, failures: 30 }],
      listOpen: [openRecord({ severity: "warning", lastDeliveredAt: "2026-06-26T11:55:00.000Z" })], // 5m ago < 60m
    });
    const summary = await evaluateOpsAlerts(deps);
    expect(summary.fired).toBe(0);
    expect(summary.delivered).toBe(0);
    expect(summary.suppressed).toBe(1);
    expect(spies.deliver).not.toHaveBeenCalled();
    expect(spies.touch).toHaveBeenCalledWith(expect.objectContaining({ delivered: false }));
  });

  it("no secret leakage: the delivered candidate carries only safe fields", async () => {
    const { deps, spies } = makeDeps({
      providerFailures: [{ provider: "slack", attempts: 50, failures: 49 }],
    });
    await evaluateOpsAlerts(deps);
    const serialized = JSON.stringify(spies.deliver.mock.calls);
    expect(serialized).not.toMatch(/xox[bap]-|whsec_|Bearer\s|sk-|@/);
  });
});
