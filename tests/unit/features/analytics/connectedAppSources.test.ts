/**
 * @jest-environment node
 *
 * Connected-app UI exposure descriptor (Slice ANALYTICS-SOURCES-SLACK-UI-1).
 * The load-bearing invariant: GitHub is registered but NOT exposed in the widget
 * UI (held back until smoke-testable); Slack IS exposed. Plus metric/filter shape.
 */

import {
  allConnectedAppSources,
  exposedConnectedAppSources,
  findMetricOption,
  getConnectedAppSource,
  getExposedConnectedAppSource,
  metricsForType,
} from "@/features/analytics/connectedAppSources";

describe("exposure gating", () => {
  it("does NOT expose GitHub in the widget UI (held back)", () => {
    const exposed = exposedConnectedAppSources().map((s) => s.provider);
    expect(exposed).not.toContain("github");
    // …but the descriptor still exists for a one-line re-enable.
    expect(getConnectedAppSource("github")?.exposed).toBe(false);
    expect(getExposedConnectedAppSource("github")).toBeNull();
  });

  it("exposes Slack", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("slack");
    expect(getExposedConnectedAppSource("slack")?.displayName).toBe("Slack");
  });

  it("every descriptor declares a credential visibility matching its sharing model", () => {
    expect(getConnectedAppSource("slack")?.visibility).toBe("account");
    expect(getConnectedAppSource("github")?.visibility).toBe("personal");
  });
});

describe("Slack metric/filter shape", () => {
  const slack = getExposedConnectedAppSource("slack")!;

  it("offers scalar metrics for stat and series metrics for line/bar", () => {
    expect(metricsForType(slack, "stat").map((m) => m.id).sort()).toEqual([
      "active_users_count",
      "channel_activity_count",
    ]);
    expect(metricsForType(slack, "line").map((m) => m.id).sort()).toEqual([
      "keyword_mentions",
      "messages_over_time",
    ]);
    // donut/table/etc. don't take a Slack metric.
    expect(metricsForType(slack, "donut")).toEqual([]);
  });

  it("keyword_mentions requires both channel and keyword; others just channel", () => {
    expect(findMetricOption(slack, "line", "keyword_mentions")?.filters).toEqual([
      "slack_channel",
      "keyword",
    ]);
    expect(findMetricOption(slack, "stat", "channel_activity_count")?.filters).toEqual([
      "slack_channel",
    ]);
  });
});

it("all descriptors expose only registry-safe metric keys (no arbitrary methods)", () => {
  for (const s of allConnectedAppSources()) {
    for (const list of Object.values(s.metricsByType)) {
      for (const m of list ?? []) {
        expect(m.id).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  }
});
