import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { CalendarEventResource } from "../../api/eventsInsert";

/**
 * Convert a Calendar event resource (from the events.list delta) into the
 * canonical V2 TriggerEvent shape that `services/triggers/dispatch.ts`
 * consumes.
 *
 * Change-kind classification (Batch 1 single-trigger model — see
 * docs/slices/slice-3-google-calendar.md §"Out of scope"):
 *   - `cancelled` when `event.status === "cancelled"`.
 *   - `created` when `event.created === event.updated` (heuristic — Google
 *     stamps both equal at insert; subsequent updates only bump `updated`).
 *   - `updated` otherwise.
 *
 * Workflow authors who want only-creates can branch on `payload.changeKind`
 * downstream. If real customers need separate trigger types later, we can
 * split with no payload-shape change.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`): combine
 * Google's eventId with the `updated` timestamp so a true update produces
 * a fresh dedup key while a duplicate push notification for the same
 * change re-uses it.
 */

export type ChangeKind = "created" | "updated" | "cancelled";

export interface NormalizeContext {
  accountId: string;
  calendarId: string;
}

export function classifyChangeKind(event: CalendarEventResource): ChangeKind {
  if (event.status === "cancelled") return "cancelled";
  const created = (event as { created?: string }).created;
  const updated = event.updated;
  if (created && updated && created === updated) return "created";
  return "updated";
}

export function normalize(
  event: CalendarEventResource,
  context: NormalizeContext,
): TriggerEvent {
  const changeKind = classifyChangeKind(event);
  const updated = event.updated ?? new Date().toISOString();
  // Combine eventId + updated so a real edit produces a fresh dedup key,
  // and duplicate push deliveries for the same change collapse via dedup.
  const eventId = `${event.id}:${updated}`;

  return {
    provider: "google-calendar",
    eventType: "event_changed",
    eventId,
    occurredAt: updated,
    accountId: context.accountId,
    payload: {
      changeKind,
      calendarId: context.calendarId,
      eventId: event.id,
      summary: event.summary ?? null,
      description: event.description ?? null,
      location: event.location ?? null,
      start: event.start ?? null,
      end: event.end ?? null,
      attendees: event.attendees ?? [],
      htmlLink: event.htmlLink ?? null,
      status: event.status ?? null,
      updated,
    },
  };
}
