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

  it("exposes Google Calendar", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("google-calendar");
    expect(getExposedConnectedAppSource("google-calendar")?.displayName).toBe("Google Calendar");
  });

  it("exposes Gmail", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("gmail");
    expect(getExposedConnectedAppSource("gmail")?.displayName).toBe("Gmail");
  });

  it("exposes Stripe", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("stripe");
    expect(getExposedConnectedAppSource("stripe")?.displayName).toBe("Stripe");
  });

  it("exposes Microsoft Outlook", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-outlook");
    expect(getExposedConnectedAppSource("microsoft-outlook")?.displayName).toBe("Microsoft Outlook");
  });

  it("exposes Outlook Calendar", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-outlook-calendar");
    expect(getExposedConnectedAppSource("microsoft-outlook-calendar")?.displayName).toBe("Outlook Calendar");
  });

  it("every descriptor declares a credential visibility matching its sharing model", () => {
    expect(getConnectedAppSource("slack")?.visibility).toBe("account");
    expect(getConnectedAppSource("github")?.visibility).toBe("personal");
    expect(getConnectedAppSource("google-calendar")?.visibility).toBe("personal");
    expect(getConnectedAppSource("gmail")?.visibility).toBe("personal");
    // Stripe is a shared business account → account-wide visibility.
    expect(getConnectedAppSource("stripe")?.visibility).toBe("account");
    // Outlook is a personal mailbox → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-outlook")?.visibility).toBe("personal");
    // Outlook Calendar is a personal calendar → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-outlook-calendar")?.visibility).toBe("personal");
  });
});

describe("Outlook Calendar metric/filter shape", () => {
  const cal = getExposedConnectedAppSource("microsoft-outlook-calendar")!;

  it("offers a scalar for stat, series for line/bar; busy_hours_by_day is bar-only", () => {
    expect(metricsForType(cal, "stat").map((m) => m.id)).toEqual(["upcoming_meetings_count"]);
    expect(metricsForType(cal, "line").map((m) => m.id).sort()).toEqual([
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(cal, "bar").map((m) => m.id).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(cal, "line").map((m) => m.id)).not.toContain("busy_hours_by_day");
    expect(metricsForType(cal, "donut")).toEqual([]);
  });

  it("every Outlook Calendar metric takes a single outlookcal_calendar filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(cal, type)) {
        expect(m.filters).toEqual(["outlookcal_calendar"]);
      }
    }
  });
});

describe("Outlook metric/filter shape", () => {
  const outlook = getExposedConnectedAppSource("microsoft-outlook")!;

  it("offers scalars for stat (unread no-filter, folder needs outlook_folder) and series for line/bar", () => {
    expect(metricsForType(outlook, "stat").map((m) => m.id).sort()).toEqual([
      "folder_message_count",
      "unread_count",
    ]);
    expect(metricsForType(outlook, "line").map((m) => m.id).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
    ]);
    expect(metricsForType(outlook, "donut")).toEqual([]);
  });

  it("unread_count takes NO filter; folder_message_count takes an outlook_folder filter", () => {
    expect(findMetricOption(outlook, "stat", "unread_count")?.filters).toEqual([]);
    expect(findMetricOption(outlook, "stat", "folder_message_count")?.filters).toEqual(["outlook_folder"]);
    expect(findMetricOption(outlook, "line", "emails_received_over_time")?.filters).toEqual([]);
  });
});

describe("Stripe metric/filter shape", () => {
  const stripe = getExposedConnectedAppSource("stripe")!;

  it("offers payment scalars for stat and series for line/bar, none for donut/table", () => {
    expect(metricsForType(stripe, "stat").map((m) => m.id).sort()).toEqual([
      "failed_payment_count",
      "gross_payment_volume",
      "successful_payment_count",
    ]);
    expect(metricsForType(stripe, "line").map((m) => m.id).sort()).toEqual([
      "gross_volume_over_time",
      "successful_payments_over_time",
    ]);
    expect(metricsForType(stripe, "bar").map((m) => m.id)).toEqual(
      metricsForType(stripe, "line").map((m) => m.id),
    );
    expect(metricsForType(stripe, "donut")).toEqual([]);
    expect(metricsForType(stripe, "table")).toEqual([]);
  });

  it("no Stripe metric takes a filter (date window is server-owned, no raw query)", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(stripe, type)) {
        expect(m.filters).toEqual([]);
      }
    }
  });
});

describe("Gmail metric/filter shape", () => {
  const gmail = getExposedConnectedAppSource("gmail")!;

  it("offers scalars for stat (unread no-filter, label needs gmail_label) and series for line/bar", () => {
    expect(metricsForType(gmail, "stat").map((m) => m.id).sort()).toEqual([
      "label_message_count",
      "unread_count",
    ]);
    expect(metricsForType(gmail, "line").map((m) => m.id).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
    ]);
    expect(metricsForType(gmail, "donut")).toEqual([]);
  });

  it("unread_count takes NO filter; label_message_count takes a gmail_label filter", () => {
    expect(findMetricOption(gmail, "stat", "unread_count")?.filters).toEqual([]);
    expect(findMetricOption(gmail, "stat", "label_message_count")?.filters).toEqual(["gmail_label"]);
    // series metrics take no filter (server-owned queries)
    expect(findMetricOption(gmail, "line", "emails_received_over_time")?.filters).toEqual([]);
  });
});

describe("Google Calendar metric/filter shape", () => {
  const gcal = getExposedConnectedAppSource("google-calendar")!;

  it("offers a scalar for stat, series for line/bar; busy_hours_by_day is bar-only", () => {
    expect(metricsForType(gcal, "stat").map((m) => m.id)).toEqual(["upcoming_meetings_count"]);
    expect(metricsForType(gcal, "line").map((m) => m.id).sort()).toEqual([
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(gcal, "bar").map((m) => m.id).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    // busy_hours_by_day must NOT appear on a line widget.
    expect(metricsForType(gcal, "line").map((m) => m.id)).not.toContain("busy_hours_by_day");
    expect(metricsForType(gcal, "donut")).toEqual([]);
  });

  it("every Google Calendar metric takes a single gcal_calendar filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(gcal, type)) {
        expect(m.filters).toEqual(["gcal_calendar"]);
      }
    }
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
