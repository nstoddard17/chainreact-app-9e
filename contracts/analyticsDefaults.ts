import type { AnalyticsWidget } from "./analytics";

/**
 * The canonical default Analytics board (extracted from
 * services/analytics/dashboards.ts in CD-3B).
 *
 * WHY IT LIVES IN `contracts/`: it is pure, dependency-free data typed by the
 * widget contract, and BOTH sides now need it — the server seeds a new
 * account's first dashboard with it, and the client's "Restore default
 * layout" action rewrites a board to it. The service module can't be imported
 * from the browser (it pulls in the service-role Supabase client), so the
 * constant moved down to the shared contracts layer rather than being
 * duplicated. `services/analytics/dashboards.ts` re-exports it, so every
 * existing import keeps working.
 *
 * Every widget binds to a metric the aggregation service actually backs
 * (no-fake-UI) — see `AnalyticsMetric`. Restore-default always writes THESE
 * definitions, never an obsolete stored snapshot.
 */
export const DEFAULT_OVERVIEW_WIDGETS: readonly AnalyticsWidget[] = [
  { id: "ov-runs", type: "stat", size: "s", title: "Runs", icon: "Bolt", config: { source: "any", metric: "runs" } },
  { id: "ov-success", type: "stat", size: "s", title: "Success rate", icon: "CircleCheck", config: { source: "any", metric: "success_rate" } },
  { id: "ov-active", type: "stat", size: "s", title: "Active automations", icon: "Layers", config: { source: "any", metric: "active_workflows" } },
  { id: "ov-duration", type: "stat", size: "s", title: "Avg run time", icon: "Clock", config: { source: "any", metric: "avg_duration" } },
  { id: "ov-overtime", type: "line", size: "xl", title: "Runs over time", icon: "History", config: { source: "any", metric: "runs_over_time" } },
  { id: "ov-outcome", type: "donut", size: "s", title: "By outcome", icon: "Filter", config: { source: "any", metric: "outcomes" } },
  { id: "ov-top", type: "bar", size: "m", title: "Top automations by runs", icon: "Layers", config: { source: "any", metric: "top_workflows" } },
  { id: "ov-heatmap", type: "heatmap", size: "l", title: "When your automations run", icon: "Clock", config: { source: "any", metric: "by_time" } },
  { id: "ov-apps", type: "bar", size: "m", title: "Connected apps", icon: "Webhook", config: { source: "any", metric: "by_app" } },
  { id: "ov-recent", type: "activity", size: "m", title: "Recent runs", icon: "History", config: { source: "any", metric: "events" } },
  {
    id: "ov-note",
    type: "note",
    size: "m",
    title: "Welcome to your dashboard",
    icon: "Sparkle",
    config: {
      source: "any",
      note: "This is your account's analytics. Click Edit dashboard to drag, resize, rename, or add widgets, then Done editing to save. Everything reflects your real runs and workflows.",
    },
  },
];
