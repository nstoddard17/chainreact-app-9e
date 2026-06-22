import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `get_page_insights` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Read-only Page analytics. `metric` is a comma-separated list of Graph
 * metric names (free text — the catalog is large and version-dependent).
 * `period` is the Graph aggregation window (static enum, no UI default —
 * the runtime schema owns the default). `since`/`until` bound the range.
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
        "Comma-separated Graph metric names (e.g. page_post_engagements,page_views_total). " +
        "Note: Meta's 2024 Page Insights deprecation removed page_impressions* / page_fans / " +
        "page_engaged_users — those return a (#100) invalid-metric error on current Graph versions.",
      type: "text",
      required: true,
      placeholder: "page_post_engagements,page_views_total",
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
      description: "Optional. ISO-8601 start of the range (e.g. 2026-05-01T00:00:00Z).",
      type: "text",
      required: false,
      placeholder: "2026-05-01T00:00:00Z",
    },
    {
      name: "until",
      label: "Until",
      description: "Optional. ISO-8601 end of the range (e.g. 2026-05-31T00:00:00Z).",
      type: "text",
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
