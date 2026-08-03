/** @jest-environment node */
/**
 * Tests for core/observability/dedupe — the spam-prevention decision.
 *
 * Business rule: the same breaching condition on every tick must deliver at most
 * once per cooldown window, but a severity escalation re-delivers immediately, and
 * a cleared condition resolves its open alert.
 */
import {
  decideDedupe,
  planAlertReconciliation,
  selectResolvedAlerts,
} from "@/core/observability/dedupe";
import type { OpsAlertCandidate, OpsAlertEventRecord } from "@/contracts/opsAlert";

const COOLDOWN = 60; // minutes
const NOW = Date.parse("2026-06-26T12:00:00.000Z");

function candidate(overrides: Partial<OpsAlertCandidate> = {}): OpsAlertCandidate {
  return {
    category: "provider_failure_rate",
    severity: "warning",
    dedupeKey: "provider_failure_rate:slack",
    windowLabel: "15m",
    count: 10,
    context: { provider: "slack" },
    recommendedAction: "check",
    ...overrides,
  };
}

function openRecord(overrides: Partial<OpsAlertEventRecord> = {}): OpsAlertEventRecord {
  return {
    id: "a1",
    category: "provider_failure_rate",
    severity: "warning",
    dedupeKey: "provider_failure_rate:slack",
    status: "open",
    firstSeenAt: "2026-06-26T11:00:00.000Z",
    lastSeenAt: "2026-06-26T11:55:00.000Z",
    occurrenceCount: 3,
    windowLabel: "15m",
    context: { provider: "slack" },
    lastDeliveredAt: "2026-06-26T11:55:00.000Z",
    resolvedAt: null,
    createdAt: "2026-06-26T11:00:00.000Z",
    ...overrides,
  };
}

describe("decideDedupe", () => {
  it("fires when there is no open alert for the key", () => {
    expect(decideDedupe({ candidate: candidate(), existingOpen: null, nowMs: NOW, cooldownMinutes: COOLDOWN })).toEqual({
      action: "fire",
    });
  });

  it("suppresses a repeat within the cooldown window (no duplicate spam)", () => {
    const existingOpen = openRecord({ lastDeliveredAt: "2026-06-26T11:30:00.000Z" }); // 30m ago < 60m
    expect(decideDedupe({ candidate: candidate(), existingOpen, nowMs: NOW, cooldownMinutes: COOLDOWN })).toEqual({
      action: "suppress",
    });
  });

  it("re-delivers once the cooldown window has elapsed", () => {
    const existingOpen = openRecord({ lastDeliveredAt: "2026-06-26T10:30:00.000Z" }); // 90m ago > 60m
    expect(decideDedupe({ candidate: candidate(), existingOpen, nowMs: NOW, cooldownMinutes: COOLDOWN })).toEqual({
      action: "deliver",
      escalated: false,
    });
  });

  it("re-delivers immediately on severity escalation, even within cooldown", () => {
    const existingOpen = openRecord({ severity: "warning", lastDeliveredAt: "2026-06-26T11:55:00.000Z" });
    const escalated = candidate({ severity: "critical" });
    expect(decideDedupe({ candidate: escalated, existingOpen, nowMs: NOW, cooldownMinutes: COOLDOWN })).toEqual({
      action: "deliver",
      escalated: true,
    });
  });

  it("treats a never-delivered open row as cooldown-elapsed", () => {
    const existingOpen = openRecord({ lastDeliveredAt: null });
    expect(decideDedupe({ candidate: candidate(), existingOpen, nowMs: NOW, cooldownMinutes: COOLDOWN })).toEqual({
      action: "deliver",
      escalated: false,
    });
  });
});

describe("selectResolvedAlerts", () => {
  it("returns open alerts whose condition is no longer in the candidate set", () => {
    const open = [
      openRecord({ id: "a1", dedupeKey: "provider_failure_rate:slack" }),
      openRecord({ id: "a2", dedupeKey: "cron_failures:poll-triggers" }),
    ];
    const stillBreaching = [candidate({ dedupeKey: "provider_failure_rate:slack" })];
    const resolved = selectResolvedAlerts(open, stillBreaching);
    expect(resolved.map((r) => r.id)).toEqual(["a2"]);
  });

  it("resolves nothing when every open alert still breaches", () => {
    const open = [openRecord({ dedupeKey: "provider_failure_rate:slack" })];
    const stillBreaching = [candidate({ dedupeKey: "provider_failure_rate:slack" })];
    expect(selectResolvedAlerts(open, stillBreaching)).toEqual([]);
  });
});

describe("planAlertReconciliation", () => {
  it("buckets fire (new), suppress (within cooldown), and resolve (cleared) in one pass", () => {
    const candidates = [
      candidate({ dedupeKey: "cron_failures:poll-triggers", category: "cron_failures" }), // new → fire
      candidate({ dedupeKey: "provider_failure_rate:slack" }), // existing, within cooldown → suppress
    ];
    const openAlerts = [
      openRecord({ id: "open-slack", dedupeKey: "provider_failure_rate:slack", lastDeliveredAt: "2026-06-26T11:55:00.000Z" }),
      openRecord({ id: "open-stale", dedupeKey: "oauth_refresh_failures:google" }), // not breaching now → resolve
    ];
    const plan = planAlertReconciliation({ candidates, openAlerts, nowMs: NOW, cooldownMinutes: COOLDOWN });
    expect(plan.toFire.map((c) => c.dedupeKey)).toEqual(["cron_failures:poll-triggers"]);
    expect(plan.toSuppress.map((s) => s.existing.id)).toEqual(["open-slack"]);
    expect(plan.toDeliver).toEqual([]);
    expect(plan.toResolve.map((r) => r.id)).toEqual(["open-stale"]);
  });

  it("re-delivers an existing alert when its cooldown has elapsed", () => {
    const candidates = [candidate({ dedupeKey: "provider_failure_rate:slack" })];
    const openAlerts = [
      openRecord({ id: "open-slack", dedupeKey: "provider_failure_rate:slack", lastDeliveredAt: "2026-06-26T10:30:00.000Z" }),
    ];
    const plan = planAlertReconciliation({ candidates, openAlerts, nowMs: NOW, cooldownMinutes: COOLDOWN });
    expect(plan.toDeliver.map((d) => d.existing.id)).toEqual(["open-slack"]);
    expect(plan.toSuppress).toEqual([]);
  });
});
