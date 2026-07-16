import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Google Analytics `send_event` ActionMeta â Slice 3.GOOGLE-ANALYTICS-4.
 *
 * Sends a GA4 Measurement Protocol event. Cascade: `accountId` (UI-scope) â
 * `propertyId` (UI-scope; scopes the data-stream picker) â `measurementId`
 * (dependsOn propertyId, backed by `google-analytics:data_streams`,
 * required). The Measurement Protocol authenticates with `apiSecret` (a
 * sensitive INPUT) â there is no password/secret FieldType, so it is a
 * `text` field clearly described as a secret; it is NEVER an output.
 *
 * Output is structural only: `{ success, eventName, sentAt }` â clientId /
 * userId / eventParams / apiSecret are NEVER echoed. Medium risk (ingests an
 * analytics event).
 */
export const googleAnalyticsSendEventMeta: ActionMeta = {
  key: "google-analytics:send_event",
  provider: "google-analytics",
  type: "send_event",
  displayName: "Send Event",
  description:
    "Send a custom event to Google Analytics 4 via the Measurement Protocol (e.g. server-side conversions or offline events).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "accountId",
      label: "Account",
      description: "Pick an account to choose its property and data stream below.",
      type: "combobox",
      optionsSource: "google-analytics:accounts",
      required: false,
      sensitivity: "connection",
      placeholder: "Select an account",
    },
    {
      name: "propertyId",
      label: "Property",
      description: "Pick a property to choose its data stream below.",
      type: "combobox",
      optionsSource: "google-analytics:properties",
      dependsOn: "accountId",
      required: false,
      placeholder: "Select a property",
    },
    {
      name: "measurementId",
      label: "Measurement ID",
      description: "The data stream's measurement ID (G-XXXXXXXXXX).",
      type: "combobox",
      optionsSource: "google-analytics:data_streams",
      dependsOn: "propertyId",
      required: true,
      placeholder: "Select a data stream",
    },
    {
      name: "apiSecret",
      label: "API Secret",
      description:
        "The Measurement Protocol API secret for this data stream (treated as a secret â created in GA Admin â Data Streams â Measurement Protocol API secrets).",
      type: "text",
      required: true,
      sensitivity: "secret",
      placeholder: "Measurement Protocol API secret",
    },
    {
      name: "clientId",
      label: "Client ID",
      description: "The GA4 client_id the event is attributed to.",
      type: "text",
      required: true,
      placeholder: "1234567.7654321",
    },
    {
      name: "eventName",
      label: "Event name",
      description: "The GA4 event name, e.g. purchase or sign_up.",
      type: "text",
      required: true,
      placeholder: "purchase",
    },
    {
      name: "eventParams",
      label: "Event parameters",
      description:
        "Optional parameters sent with the event, as name/value entries (for example: value = 9.99, currency = USD). Values are sent as text.",
      type: "keyvalue",
      required: false,
      keyValueShape: "record",
    },
    {
      name: "userId",
      label: "User ID",
      description: "Optional GA4 user_id for cross-device attribution.",
      type: "text",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "Whether the event was accepted." },
    { name: "eventName", type: "string", description: "The event name that was sent." },
    { name: "sentAt", type: "string", description: "ISO-8601 time the event was sent." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Ingests an event into your GA4 data stream. Not destructive; analytics data is not cleanly recallable.",
};
