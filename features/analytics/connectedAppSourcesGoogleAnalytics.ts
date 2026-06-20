import type { ConnectedAppSourceUi } from "./connectedAppSources";

/**
 * Google Analytics (GA4) connected-app analytics UI descriptor — Slice
 * ANALYTICS-SOURCES-GA-1. Split out of connectedAppSources.ts to keep that module
 * under its line cap (sibling pattern shared with Excel / Facebook / Workspace).
 * Pure data — type-only import, no runtime cycle.
 *
 * Personal connection (each viewer sees data from THEIR OWN Google Analytics
 * connection). Aggregate-only metrics scoped to ONE property (required
 * `ga_property` picker via the google-analytics:properties_flat resolver):
 * active/total users, sessions, page views, events (stat), and the same metrics
 * over time (line/bar). Only counts + date buckets are ever rendered — never a
 * user id, page path, url, search term, or geo/device breakdown.
 */
export const GOOGLE_ANALYTICS: ConnectedAppSourceUi = {
  provider: "google-analytics",
  displayName: "Google Analytics",
  exposed: true,
  icon: "Eye",
  connectHref: "/apps",
  connectTitle: "Connect your Google Analytics",
  connectHelp: "This widget uses your own Google Analytics connection. Connect it to see your data.",
  connectCtaLabel: "Connect Google Analytics",
  visibility: "personal",
  attributionPrefix: "Your Google Analytics",
  metricsByType: {
    stat: [
      { id: "active_users", label: "Active users", filters: ["ga_property"] },
      { id: "total_users", label: "Total users", filters: ["ga_property"] },
      { id: "sessions", label: "Sessions", filters: ["ga_property"] },
      { id: "screen_page_views", label: "Page views", filters: ["ga_property"] },
      { id: "event_count", label: "Events", filters: ["ga_property"] },
    ],
    line: [
      { id: "active_users_over_time", label: "Active users over time", filters: ["ga_property"] },
      { id: "sessions_over_time", label: "Sessions over time", filters: ["ga_property"] },
      { id: "screen_page_views_over_time", label: "Page views over time", filters: ["ga_property"] },
      { id: "event_count_over_time", label: "Events over time", filters: ["ga_property"] },
    ],
    bar: [
      { id: "active_users_over_time", label: "Active users over time", filters: ["ga_property"] },
      { id: "sessions_over_time", label: "Sessions over time", filters: ["ga_property"] },
      { id: "screen_page_views_over_time", label: "Page views over time", filters: ["ga_property"] },
      { id: "event_count_over_time", label: "Events over time", filters: ["ga_property"] },
    ],
  },
};
