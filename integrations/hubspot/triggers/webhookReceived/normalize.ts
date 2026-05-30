import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert one HubSpot webhook event item to V2's canonical `TriggerEvent`
 * shape — Slice 13 Commit 5.
 *
 * HubSpot's webhook wire format: the POST body is an ARRAY of event
 * items, NOT a single envelope. Each item carries:
 *   {
 *     eventId: 12345,                 // integer, globally unique
 *     subscriptionId: 67890,          // the HubSpot subscription id
 *     portalId: 11223344,             // the customer's hub id
 *     appId: 99887766,                // V2's app id
 *     occurredAt: 1700000000000,      // unix millis
 *     subscriptionType: "contact.propertyChange",
 *     attemptNumber: 0,
 *     objectId: 5001,                 // the CRM object id (contact /
 *                                     // company / deal / ticket)
 *     propertyName: "email",          // only for *.propertyChange
 *     propertyValue: "new@example.com", // only for *.propertyChange
 *     changeSource: "USER"            // optional, *.propertyChange
 *   }
 *
 * Canonical TriggerEvent fields:
 *   - `provider: "hubspot"` — fixed.
 *   - `eventType: "webhook_received"` — the consolidated trigger name
 *     (matches `findActivation("hubspot", "webhook_received")`).
 *     Workflows branch on `payload.subscriptionType` for the actual
 *     HubSpot event-type discriminator (e.g. `"contact.creation"`).
 *   - `eventId` — HubSpot's `eventId` as a string. Globally unique
 *     across all events the app receives; load-bearing for
 *     `webhook_event_dedup`. Slice 13 plan §"Dedup": prefer the
 *     provider id, with a deterministic fallback (Slice plan
 *     `portalId/eventType/objectId/propertyName?/occurredAt`) when the
 *     provider field is absent (test fixtures / future event types
 *     that omit it).
 *   - `occurredAt: ISO-8601 from occurredAt` (unix millis). Falls back
 *     to `new Date().toISOString()` when missing.
 *   - `accountId: portalId` (as string). Matches the integration's
 *     `providerAccountId` (`integrations.provider_account_id`), so
 *     workflow authors can reference `{{trigger.payload.portalId}}`
 *     for cross-event correlation.
 *   - `payload` carries the raw HubSpot event verbatim plus a flattened
 *     view of the load-bearing discriminator fields. Workflow nodes
 *     branch on `payload.subscriptionType` (the HubSpot event type) and
 *     drill into `payload.event` for the raw shape.
 */

export const HUBSPOT_TRIGGER_EVENT_TYPE = "webhook_received";

export interface HubSpotWebhookEvent {
  eventId?: number | string;
  subscriptionId?: number | string;
  portalId: number | string;
  appId?: number | string;
  occurredAt?: number | string;
  subscriptionType: string;
  attemptNumber?: number;
  objectId?: number | string;
  propertyName?: string | null;
  propertyValue?: unknown;
  changeSource?: string | null;
}

function asString(v: number | string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  return String(v);
}

function bestOccurredAt(event: HubSpotWebhookEvent): string {
  const ms = event.occurredAt;
  if (typeof ms === "number" && Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  if (typeof ms === "string" && ms.length > 0) {
    const parsed = Number.parseInt(ms, 10);
    if (Number.isFinite(parsed) && String(parsed) === ms.trim()) {
      return new Date(parsed).toISOString();
    }
    // Already-ISO-formatted timestamps round-trip through Date.
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Build the dedup id. Prefers HubSpot's `eventId` (globally unique).
 * Falls back to a deterministic string keyed on the event's natural
 * identity for test fixtures / payloads that omit `eventId`. The
 * fallback shape matches the Slice 13 plan §"Dedup" recipe.
 */
function buildDedupId(event: HubSpotWebhookEvent): string {
  if (event.eventId !== undefined && event.eventId !== null) {
    return String(event.eventId);
  }
  const parts = [
    String(event.portalId ?? "no-portal"),
    event.subscriptionType,
    asString(event.objectId) ?? "no-object",
    event.propertyName ?? "no-property",
    asString(event.occurredAt) ?? "no-ts",
  ];
  return parts.join(":");
}

export function normalizeHubSpotEvent(
  event: HubSpotWebhookEvent,
): TriggerEvent {
  return {
    provider: "hubspot",
    eventType: HUBSPOT_TRIGGER_EVENT_TYPE,
    eventId: buildDedupId(event),
    occurredAt: bestOccurredAt(event),
    providerAccountId: String(event.portalId),
    payload: {
      subscriptionType: event.subscriptionType,
      portalId: String(event.portalId),
      hubId: String(event.portalId),
      objectId: asString(event.objectId),
      propertyName: event.propertyName ?? null,
      propertyValue: event.propertyValue ?? null,
      occurredAt:
        typeof event.occurredAt === "number" ? event.occurredAt : null,
      subscriptionId: asString(event.subscriptionId),
      appId: asString(event.appId),
      attemptNumber: event.attemptNumber ?? null,
      changeSource: event.changeSource ?? null,
      event,
    },
  };
}
