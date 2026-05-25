import type { ActionMeta } from "@/contracts/actionMeta";
import { COUNTING_METHOD_OPTIONS } from "./_metaOptions";

/**
 * Google Analytics `create_conversion_event` ActionMeta — Slice
 * 3.GOOGLE-ANALYTICS-4.
 *
 * Admin write — marks an event as a conversion on a property. `accountId`
 * UI-scope → `propertyId` (dependsOn accountId, required). Medium risk
 * (recoverable by removing the conversion in the GA console). Field names
 * mirror the GA-2 runtime schema (`countingMethod`, `customEvent`).
 */
export const googleAnalyticsCreateConversionEventMeta: ActionMeta = {
  key: "google-analytics:create_conversion_event",
  provider: "google-analytics",
  type: "create_conversion_event",
  displayName: "Create Conversion Event",
  description:
    "Mark a Google Analytics 4 event as a conversion (key event) on a property.",
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
      description: "The GA4 property to add the conversion to.",
      type: "combobox",
      optionsSource: "google-analytics:properties",
      dependsOn: "accountId",
      required: true,
      placeholder: "Select a property",
    },
    {
      name: "eventName",
      label: "Event name",
      description: "The event to mark as a conversion, e.g. purchase.",
      type: "text",
      required: true,
      placeholder: "purchase",
    },
    {
      name: "countingMethod",
      label: "Counting method",
      description: "How conversions are counted.",
      type: "select",
      required: false,
      options: [...COUNTING_METHOD_OPTIONS],
    },
    {
      name: "customEvent",
      label: "Custom event",
      description: "Mark this as a custom (non-default) event.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "eventName", type: "string", description: "The conversion event name.", sensitive: true },
    { name: "countingMethod", type: "string", description: "How the conversion is counted." },
    { name: "conversionEventId", type: "string", description: "The created conversion event id." },
    { name: "resourceName", type: "string", description: "Full GA resource name." },
    { name: "propertyId", type: "string", description: "The property the conversion was created on." },
    { name: "createdAt", type: "string", description: "Creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes the GA4 property's conversion configuration. Recoverable by removing the conversion in the GA console.",
};
