import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `get_page_insights` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Read-only Page analytics. `metric` is a combobox seeded with the
 * in-repo-verified metric names (live-certified `page_post_engagements`
 * plus the long-standing `page_views_total` example) with manual entry
 * for the rest of Graph's large, version-dependent catalog — a typed
 * comma-separated list still commits the same string. `period` is the
 * Graph aggregation window (static enum, no UI default — the runtime
 * schema owns the default). `since`/`until` bound the range
 * (`datetime-utc`; the schema accepts the trailing-`Z` instant).
 * The `metrics` collection output is marked sensitive (private Page
 * performance). Field names mirror the runtime schema exactly.
 */
export const facebookGetPageInsightsMeta: ActionMeta = {
  key: "facebook:get_page_insights",
  provider: "facebook",
  type: "get_page_insights",
  displayName: "Get Page Insights",
  description: "Read analytics metrics for a Facebook Page over a time window.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page to read insights for.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "metric",
      label: "Metrics",
      description:
        "The Page statistic to read. Pick a metric, or type comma-separated metric names to read several at once. " +
        "Metrics Meta has retired (page_impressions, page_fans, page_engaged_users) no longer work.",
      type: "combobox",
      required: true,
      options: [
        { value: "page_post_engagements", label: "Post engagements" },
        { value: "page_views_total", label: "Page views (total)" },
      ],
      allowManualEntry: true,
      placeholder: "page_post_engagements",
    },
    {
      name: "period",
      label: "Period",
      description: "Aggregation window for the metrics.",
      type: "select",
      required: false,
      options: [
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "days_28", label: "28 days" },
      ],
    },
    {
      name: "since",
      label: "Since",
      description: "Start of the reporting window (UTC). Leave empty for the default range.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-05-01T00:00:00Z",
    },
    {
      name: "until",
      label: "Until",
      description: "End of the reporting window (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-05-31T00:00:00Z",
    },
  ],
  outputs: [
    {
      name: "metrics",
      type: "array",
      description: "The insight metric series returned by Graph.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of metric entries returned." },
    { name: "pageId", type: "string", description: "Id of the Page." },
    { name: "metric", type: "string", description: "The requested metric list (echo of input)." },
    { name: "period", type: "string", description: "The aggregation window used." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Read-only analytics of your own Page. Returns private Page performance data.",
};
