import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `hubspot:webhook_received` — Slice 3.HUBSPOT-6.
 *
 * Consolidated HubSpot webhook trigger. ONE trigger meta covers every
 * subscription type in
 * `integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts`
 * (12 types as of HubSpot 2.1: contact / company / deal / ticket × creation /
 * propertyChange / deletion). Workflows branch on
 * `payload.subscriptionType` to discriminate the actual HubSpot event.
 *
 * Activation is webhook-shaped. `index.ts` calls
 * `registerActivation("hubspot", "webhook_received", activate)`, so the
 * `trigger-meta-activation-invariant` test is satisfied — no exemption
 * needed in `SHARED_INFRA_EXEMPT_KEYS`.
 *
 * Activate behavior (see `activate.ts`):
 *   - Reads `config.subscriptions` (REQUIRED, non-empty array of
 *     `{ eventType, propertyName? }` items).
 *   - For each item, `findOrCreate`s an app-level subscription in
 *     `hubspot_app_subscriptions` (HubSpot creates only ONE subscription
 *     per `(appId, eventType, propertyName)` across the whole installation
 *     — V2 dedups via this table) and `upsert`s a workflow→subscription
 *     ref in `hubspot_subscription_refs`.
 *   - HubSpot Public-App subscriptions never expire → no renewal cron,
 *     no `subscription-watch` marker on `trigger_resources.config`.
 *
 * Subscription items must obey:
 *   - `eventType ∈ HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`. Out-of-allowlist
 *     types fail activation loudly at design time.
 *   - `propertyName` REQUIRED for `*.propertyChange` types
 *     (`contact.propertyChange`, `company.propertyChange`,
 *     `deal.propertyChange`, `ticket.propertyChange`) — HubSpot scopes
 *     propertyChange subscriptions per-property.
 *   - `propertyName` MUST be absent (or null/empty) on
 *     `*.creation` / `*.deletion` types — `activate.ts` rejects the
 *     property-name to prevent silently-scoped subscriptions that
 *     HubSpot would create but never narrow events for.
 *
 * Field surface — single `subscriptions` textarea (paste-JSON).
 * Rationale: each subscription is a 1- or 2-field object, the count
 * varies per workflow (typical: 1–4), and there's no dedicated
 * "array-of-object" field type in the builder yet. Paste-JSON mirrors
 * the Notion / Stripe paste-JSON pattern already established for
 * variable-shape config. Activation's `parseSubscriptions` enforces the
 * exact shape — design-time validation lands when a dedicated array-of-
 * struct field type ships.
 *
 * Payload — mirrors `normalize.ts:normalizeHubSpotEvent` exactly.
 * `propertyValue` and `event` (raw payload) MUST stay sensitive — they
 * carry the actual changed values (e.g. a contact's new email, a deal's
 * new amount). Discriminator scalars stay structural: subscriptionType
 * tells the workflow what kind of event happened, but doesn't carry
 * customer data on its own.
 */
export const hubspotWebhookReceivedTriggerMeta: TriggerMeta = {
  key: "hubspot:webhook_received",
  provider: "hubspot",
  type: "webhook_received",
  displayName: "Webhook Received",
  description:
    "Fires when HubSpot delivers a webhook event matching one of the configured subscriptions. ONE consolidated trigger covers every HubSpot subscription type — workflows branch on `payload.subscriptionType` to discriminate (e.g. `contact.creation` vs `deal.propertyChange`). Allowed object types: `contact`, `company`, `deal`, `ticket`. Allowed event types: `creation`, `propertyChange`, `deletion`. `propertyChange` subscriptions REQUIRE a `propertyName` (HubSpot scopes them per-property); `creation` / `deletion` subscriptions MUST NOT carry a `propertyName`. App-level subscriptions are deduplicated across the whole installation — multiple workflows watching the same `(eventType, propertyName)` share one HubSpot subscription via a server-side ref table.",
  category: "crm",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "subscriptions",
      label: "Subscriptions (paste JSON)",
      description:
        "Required. Paste a JSON array of subscription items, each shaped `{ \"eventType\": \"<type>\", \"propertyName\": \"<property>\"? }`. " +
        "Allowed `eventType` values: `contact.creation`, `contact.propertyChange`, `contact.deletion`, `company.creation`, `company.propertyChange`, `company.deletion`, `deal.creation`, `deal.propertyChange`, `deal.deletion`, `ticket.creation`, `ticket.propertyChange`, `ticket.deletion`. " +
        "`propertyName` is REQUIRED for `*.propertyChange` types (HubSpot scopes those subscriptions per-property) and MUST be omitted on `*.creation` / `*.deletion`. " +
        "Activation rejects unknown event types, missing `propertyName` on propertyChange, stray `propertyName` on creation/deletion, and duplicates within the array. " +
        "Example: `[{\"eventType\":\"contact.creation\"},{\"eventType\":\"deal.propertyChange\",\"propertyName\":\"amount\"}]`.",
      type: "textarea",
      required: true,
      placeholder:
        '[{"eventType":"contact.creation"},{"eventType":"deal.propertyChange","propertyName":"amount"}]',
    },
  ],
  payloadShape: [
    {
      name: "subscriptionType",
      type: "string",
      description:
        "The HubSpot subscription type that matched (e.g. `contact.creation`, `deal.propertyChange`). Use this to discriminate inside a single workflow that subscribes to multiple types — `{{trigger.payload.subscriptionType === 'deal.propertyChange'}}`.",
    },
    {
      name: "portalId",
      type: "string",
      description:
        "HubSpot portal id (also called hub id) — the customer's HubSpot account id. Matches the integration's `providerAccountId`. Opaque numeric id, safe to surface unredacted.",
    },
    {
      name: "hubId",
      type: "string",
      description:
        "Alias for `portalId` (HubSpot's docs use both terms). Same value — provided for naming convenience downstream.",
    },
    {
      name: "objectId",
      type: "string",
      description:
        "HubSpot CRM object id the event is about (contact / company / deal / ticket id depending on `subscriptionType`). Opaque numeric id. Wire downstream into `hubspot:get_contacts` / `get_deals` / etc. filterValue to fetch the full record. Null when HubSpot omits it (rare — only on pure system events).",
    },
    {
      name: "propertyName",
      type: "string",
      description:
        "The property whose value changed. Only present on `*.propertyChange` events (e.g. `email`, `amount`, `dealstage`). Null on `creation` / `deletion`. Structural — the property name itself is not customer data.",
    },
    {
      name: "propertyValue",
      type: "unknown",
      description:
        "The new value of the changed property. Only present on `*.propertyChange` events. Marked sensitive — this is the actual customer data that changed (a contact's new email, a deal's new amount, etc.).",
      sensitive: true,
    },
    {
      name: "occurredAt",
      type: "number",
      description:
        "When HubSpot recorded the event, as a unix-millisecond timestamp. Null when HubSpot omits it. (The top-level `TriggerEvent.occurredAt` carries the same time as an ISO 8601 string for the workflow engine; this field is the raw HubSpot wire value.)",
    },
    {
      name: "subscriptionId",
      type: "string",
      description:
        "The HubSpot subscription id that matched the event. Opaque numeric id (the app-level subscription, shared across workflows watching the same `(eventType, propertyName)`).",
    },
    {
      name: "appId",
      type: "string",
      description:
        "The HubSpot Public App id that owns the subscription. Set from `HUBSPOT_APP_ID` env at activation time. Opaque numeric id.",
    },
    {
      name: "attemptNumber",
      type: "number",
      description:
        "HubSpot retry counter — 0 on first delivery, 1+ on retries after a non-2xx response. Use to detect re-delivery if workflows are not naturally idempotent.",
    },
    {
      name: "changeSource",
      type: "string",
      description:
        "What HubSpot says triggered the change — typically `USER`, `IMPORT`, `WORKFLOW`, `INTEGRATION`, etc. Only meaningful on `*.propertyChange` events.",
    },
    {
      name: "event",
      type: "object",
      description:
        "Raw HubSpot event payload (the full wire item HubSpot POSTed). Marked sensitive — contains the propertyValue plus any future HubSpot wire fields that may carry customer data. Drill into specific fields above instead of consuming the whole object when possible.",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
