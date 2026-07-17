import type { TriggerMeta } from "@/contracts/triggerMeta";
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES } from "./allowedSubscriptionTypes";

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
 * Field surface — single `subscriptions` object-list (CONFIG-UX-AUDIT-1).
 * Each row is one subscription: an event-type picker plus a property-name
 * picker that appears only for `*.propertyChange` events. The renderer
 * writes the REAL `[{ eventType, propertyName? }]` array that
 * `parseSubscriptions` expects — the previous paste-JSON textarea stored
 * a STRING, which activation rejected outright (`Array.isArray` guard),
 * so the visual editor is both the UX fix and the correctness fix.
 * Activation stays authoritative for validation (allowlist, propertyName
 * rules, duplicates).
 *
 * RESOLVERS-4 — `propertyName` is a REAL picker of the portal's own
 * properties, scoped per row by that row's `eventType` (`dependsOnRow` →
 * `hubspot:subscription_properties`, which maps the event's object prefix to
 * the right HubSpot object type server-side). The saved row shape is
 * UNCHANGED — still `[{ eventType, propertyName? }]` with `propertyName` an
 * internal property-name string — so activation and `parseSubscriptions` are
 * untouched by the picker.
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
      label: "Events to watch",
      description:
        "Add the HubSpot events this workflow should watch. For property-change events, also name the property to watch (e.g. `amount` on a deal) — HubSpot tracks property changes per property.",
      type: "object-list",
      required: true,
      itemFields: [
        {
          name: "eventType",
          label: "Event",
          type: "select",
          required: true,
          placeholder: "Choose a HubSpot event…",
          // Static by design: this mirrors HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES
          // (V2's own activation allowlist) 1:1 — the count guard below
          // keeps them in sync.
          options: [
            { value: "contact.creation", label: "Contact created" },
            { value: "contact.propertyChange", label: "Contact property changed" },
            { value: "contact.deletion", label: "Contact deleted" },
            { value: "company.creation", label: "Company created" },
            { value: "company.propertyChange", label: "Company property changed" },
            { value: "company.deletion", label: "Company deleted" },
            { value: "deal.creation", label: "Deal created" },
            { value: "deal.propertyChange", label: "Deal property changed" },
            { value: "deal.deletion", label: "Deal deleted" },
            { value: "ticket.creation", label: "Ticket created" },
            { value: "ticket.propertyChange", label: "Ticket property changed" },
            { value: "ticket.deletion", label: "Ticket deleted" },
          ],
        },
        {
          // RESOLVERS-4 — a REAL picker of the portal's own properties.
          //
          // `hubspot:subscription_properties` takes this row's `eventType`
          // (`dependsOnRow` — the same row-local scope `visibleWhen` uses) and
          // dispatches SERVER-SIDE to the matching object type's properties, so
          // a deal row lists deal properties and a contact row lists contact
          // properties. `allowManualEntry` keeps raw internal names + upstream
          // `{{...}}` mapping available for power users.
          //
          // `type` stays "text": a sub-field's `type` is its VALUE type, not a
          // widget selector (there is no "combobox" sub-field type).
          // `optionsSource` is what upgrades the input to a picker, and the row
          // still commits the same plain string `parseSubscriptions` has always
          // read.
          name: "propertyName",
          label: "Property to watch",
          description:
            "The property whose changes should fire this workflow (e.g. Amount on a deal, Lead status on a contact).",
          type: "text",
          required: true,
          placeholder: "Choose a property…",
          optionsSource: "hubspot:subscription_properties",
          dependsOnRow: "eventType",
          allowManualEntry: true,
          visibleWhen: { field: "eventType", valueEndsWith: ".propertyChange" },
        },
      ],
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

// Compile-time guard: the 12 static event options above must stay in sync
// with the runtime allowlist (a readonly tuple, so `.length` is the literal
// `12`). Adding/removing an allowlisted type stops this type-checking and
// forces the options[] to be updated too. The trigger-config test also
// asserts set equality between option values and the allowlist.
const _SUBSCRIPTION_TYPE_COUNT_GUARD: 12 = HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES.length;
void _SUBSCRIPTION_TYPE_COUNT_GUARD;
