import type { ActionMeta } from "@/contracts/actionMeta";
import {
  REALTIME_METRIC_OPTIONS,
  REALTIME_DIMENSION_OPTIONS,
} from "./_metaOptions";

/**
 * Google Analytics `get_realtime_data` ActionMeta — Slice
 * 3.GOOGLE-ANALYTICS-4.
 *
 * Read (last ~30 min). No date range. `accountId` UI-scope → `propertyId`
 * (dependsOn accountId, required). Realtime metric/dimension curated lists.
 * Realtime data + aggregates are sensitive.
 */
export const googleAnalyticsGetRealtimeDataMeta: ActionMeta = {
  key: "google-analytics:get_realtime_data",
  provider: "google-analytics",
  type: "get_realtime_data",
  displayName: "Get Realtime Data",
  description:
    "Read Google Analytics 4 realtime metrics for a property (the last ~30 minutes of activity).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "accountId",
      sensitivity: "connection",
      label: "Account",
      description: "Pick an account to choose its property below.",
      type: "combobox",
      optionsSource: "google-analytics:accounts",
      required: false,
      placeholder: "Select an account",
    },
    {
      name: "propertyId",
      label: "Property",
      description: "The GA4 property to read realtime data for.",
      type: "combobox",
      optionsSource: "google-analytics:properties",
      dependsOn: "accountId",
      required: true,
      placeholder: "Select a property",
    },
    {
      name: "metrics",
      label: "Metrics",
      description: "One or more GA4 realtime metrics.",
      type: "select",
      multiple: true,
      required: true,
      options: [...REALTIME_METRIC_OPTIONS],
    },
    {
      name: "dimensions",
      label: "Dimensions",
      description: "Optional realtime dimensions to break the metrics down by.",
      type: "select",
      multiple: true,
      required: false,
      options: [...REALTIME_DIMENSION_OPTIONS],
    },
    {
      name: "limit",
      label: "Row limit",
      description: "Maximum rows to return.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true },
    },
  ],
  outputs: [
    { name: "activeUsers", type: "number", description: "Active users now (when requested).", sensitive: true },
    { name: "pageViews", type: "number", description: "Realtime page views (when requested).", sensitive: true },
    { name: "eventCount", type: "number", description: "Realtime event count (when requested).", sensitive: true },
    { name: "rows", type: "array", description: "Realtime report rows.", sensitive: true },
    { name: "rowCount", type: "number", description: "Number of rows returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only realtime analytics of your own GA4 property.",
};
