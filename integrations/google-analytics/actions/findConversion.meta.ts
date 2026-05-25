import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Google Analytics `find_conversion` ActionMeta — Slice
 * 3.GOOGLE-ANALYTICS-4.
 *
 * Read. `accountId` UI-scope → `propertyId` (dependsOn accountId, required) →
 * `conversionEventName` (dependsOn propertyId, backed by
 * `google-analytics:conversion_events`). Conversion event name is a business
 * goal → marked sensitive.
 */
export const googleAnalyticsFindConversionMeta: ActionMeta = {
  key: "google-analytics:find_conversion",
  provider: "google-analytics",
  type: "find_conversion",
  displayName: "Find Conversion",
  description:
    "Look up a Google Analytics 4 conversion event on a property by its event name.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "accountId",
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
      description: "The GA4 property to search.",
      type: "combobox",
      optionsSource: "google-analytics:properties",
      dependsOn: "accountId",
      required: true,
      placeholder: "Select a property",
    },
    {
      name: "conversionEventName",
      label: "Conversion event",
      description: "The conversion event to find. Pick a property first to load its events.",
      type: "combobox",
      optionsSource: "google-analytics:conversion_events",
      dependsOn: "propertyId",
      required: true,
      placeholder: "Select a conversion event",
    },
  ],
  outputs: [
    { name: "found", type: "boolean", description: "Whether the conversion event was found." },
    { name: "eventName", type: "string", description: "The conversion event name.", sensitive: true },
    { name: "countingMethod", type: "string", description: "ONCE_PER_EVENT or ONCE_PER_SESSION (or null)." },
    { name: "conversionEventId", type: "string", description: "The conversion event id (or null)." },
    { name: "resourceName", type: "string", description: "Full GA resource name (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only lookup of a conversion event on your own GA4 property.",
};
