/**
 * @jest-environment node
 *
 * Connected-app UI exposure descriptor (Slice ANALYTICS-SOURCES-SLACK-UI-1;
 * GitHub re-exposed in ANALYTICS-SOURCES-GITHUB-UI-2). Both Slack and GitHub are
 * exposed; the `exposed` switch remains the chokepoint for any future provider.
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
  it("exposes GitHub in the widget UI (re-enabled after the connection was fixed)", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("github");
    expect(getConnectedAppSource("github")?.exposed).toBe(true);
    expect(getExposedConnectedAppSource("github")?.displayName).toBe("GitHub");
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

describe("GitHub metric/filter shape", () => {
  const github = getExposedConnectedAppSource("github")!;

  it("offers scalar metrics for stat and series metrics for line/bar (not donut/table)", () => {
    expect(metricsForType(github, "stat").map((m) => m.id).sort()).toEqual([
      "open_issues",
      "open_prs",
    ]);
    expect(metricsForType(github, "line").map((m) => m.id).sort()).toEqual([
      "issues_opened",
      "prs_merged",
      "prs_opened",
    ]);
    expect(metricsForType(github, "bar").map((m) => m.id)).toEqual(
      metricsForType(github, "line").map((m) => m.id),
    );
    expect(metricsForType(github, "donut")).toEqual([]);
    expect(metricsForType(github, "table")).toEqual([]);
  });

  it("every GitHub metric takes a single repo filter (no multi-repo / qualifiers)", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(github, type)) {
        expect(m.filters).toEqual(["repo"]);
      }
    }
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
