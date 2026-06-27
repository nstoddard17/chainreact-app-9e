/**
 * Tests for core/observability/alertThresholds.
 *
 * Pure env resolution. Proves: defaults are returned with no env; valid env
 * overrides apply; invalid / zero / negative env falls back to the default
 * (never silently disables a threshold); the queue-monitoring gate is OFF unless
 * explicitly "true".
 */
import {
  DEFAULT_OPS_ALERT_THRESHOLDS,
  isQueueBacklogMonitoringEnabled,
  resolveOpsAlertThresholds,
} from "@/core/observability/alertThresholds";

describe("resolveOpsAlertThresholds", () => {
  it("returns the conservative defaults when no env is set", () => {
    expect(resolveOpsAlertThresholds({})).toEqual(DEFAULT_OPS_ALERT_THRESHOLDS);
  });

  it("applies a valid env override", () => {
    const t = resolveOpsAlertThresholds({ OPS_ALERT_STUCK_RUN_MIN_COUNT: "10" });
    expect(t.stuckRunMinCount).toBe(10);
    // unrelated thresholds keep defaults
    expect(t.providerFailRatePct).toBe(DEFAULT_OPS_ALERT_THRESHOLDS.providerFailRatePct);
  });

  it("falls back to the default for invalid / zero / negative values", () => {
    const t = resolveOpsAlertThresholds({
      OPS_ALERT_STUCK_RUN_MIN_COUNT: "not-a-number",
      OPS_ALERT_PROVIDER_FAIL_RATE_PCT: "0",
      OPS_ALERT_COOLDOWN_MIN: "-5",
    });
    expect(t.stuckRunMinCount).toBe(DEFAULT_OPS_ALERT_THRESHOLDS.stuckRunMinCount);
    expect(t.providerFailRatePct).toBe(DEFAULT_OPS_ALERT_THRESHOLDS.providerFailRatePct);
    expect(t.alertCooldownMinutes).toBe(DEFAULT_OPS_ALERT_THRESHOLDS.alertCooldownMinutes);
  });
});

describe("isQueueBacklogMonitoringEnabled", () => {
  it("is OFF by default (durable-queue substrate not live)", () => {
    expect(isQueueBacklogMonitoringEnabled({})).toBe(false);
    expect(isQueueBacklogMonitoringEnabled({ QUEUE_BACKLOG_MONITORING_ENABLED: "false" })).toBe(false);
    expect(isQueueBacklogMonitoringEnabled({ QUEUE_BACKLOG_MONITORING_ENABLED: "1" })).toBe(false);
  });

  it("is ON only when explicitly 'true'", () => {
    expect(isQueueBacklogMonitoringEnabled({ QUEUE_BACKLOG_MONITORING_ENABLED: "true" })).toBe(true);
  });
});
