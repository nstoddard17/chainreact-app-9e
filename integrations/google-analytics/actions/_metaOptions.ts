import type { FieldOption } from "@/contracts/actionMeta";

/**
 * Curated static option lists for the GA4 ActionMeta — Slice
 * 3.GOOGLE-ANALYTICS-4.
 *
 * Per the GA-1 plan §3 (D-GA4 cohort): ship CURATED static metric/dimension
 * lists now; a dynamic per-property metadata resolver (Data API
 * `properties.getMetadata`) is deferred. Values are GA4 Data API metric /
 * dimension API names. Shared by run_report / run_pivot_report /
 * get_realtime_data so the lists stay consistent and DRY.
 */

export const DATE_RANGE_OPTIONS: readonly FieldOption[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

/** Core report metrics (run_report + run_pivot_report). */
export const REPORT_METRIC_OPTIONS: readonly FieldOption[] = [
  { value: "sessions", label: "Sessions" },
  { value: "totalUsers", label: "Total users" },
  { value: "newUsers", label: "New users" },
  { value: "screenPageViews", label: "Page views" },
  { value: "conversions", label: "Conversions" },
  { value: "engagementRate", label: "Engagement rate" },
  { value: "bounceRate", label: "Bounce rate" },
  { value: "averageSessionDuration", label: "Avg. session duration" },
  { value: "eventCount", label: "Event count" },
  { value: "totalRevenue", label: "Total revenue" },
];

/** Core report dimensions (run_report rows + run_pivot_report rows/pivots). */
export const REPORT_DIMENSION_OPTIONS: readonly FieldOption[] = [
  { value: "date", label: "Date" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "deviceCategory", label: "Device category" },
  { value: "pagePath", label: "Page path" },
  { value: "source", label: "Source" },
  { value: "medium", label: "Medium" },
  { value: "campaign", label: "Campaign" },
];

/** Realtime metrics (get_realtime_data) — the GA4 Realtime API subset. */
export const REALTIME_METRIC_OPTIONS: readonly FieldOption[] = [
  { value: "activeUsers", label: "Active users" },
  { value: "screenPageViews", label: "Page views" },
  { value: "eventCount", label: "Event count" },
  { value: "conversions", label: "Conversions" },
];

/** Realtime dimensions (get_realtime_data). */
export const REALTIME_DIMENSION_OPTIONS: readonly FieldOption[] = [
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "deviceCategory", label: "Device category" },
  { value: "platform", label: "Platform" },
  { value: "unifiedScreenName", label: "Page / screen" },
];

export const COUNTING_METHOD_OPTIONS: readonly FieldOption[] = [
  { value: "ONCE_PER_EVENT", label: "Once per event" },
  { value: "ONCE_PER_SESSION", label: "Once per session" },
];
