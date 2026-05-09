import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  GraphAttendee,
  GraphEvent,
} from "../../api/eventsCreate";

/**
 * Convert a Microsoft Graph event + the originating notification
 * envelope into the canonical V2 TriggerEvent shape.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 *   `${subscriptionId}:${eventId}:${changeType}`
 *
 * Slice 7 plan §"Dedup key shape":
 *   - subscriptionId distinguishes notifications that fan out to
 *     multiple subscriptions during rotation.
 *   - eventId is the Graph event id, stable per event.
 *   - changeType is part of the key so created → updated → deleted on
 *     the same event emits three distinct dispatcher events.
 *
 * Output payload mirrors the plan's "Output shape" section:
 *   - eventId, changeType (surfaced from the notification envelope so
 *     workflow authors can branch), subject, start, end, isAllDay,
 *     location, body, attendees, organizer, isOnlineMeeting,
 *     onlineMeetingUrl, webLink, importance, sensitivity,
 *     createdDateTime, lastModifiedDateTime.
 *   - Each attendee normalized to `{ name, address, type, status }`.
 *   - Organizer normalized to `{ name, address }`.
 *
 * `changeType: "deleted"` minimal-payload variant: when Graph's `GET
 * /me/events/{id}` 404s for a deleted event, the receive handler calls
 * `normalizeDeleted()` instead, which emits a stable shape with
 * `subject: null` so workflows can react to the deletion without a
 * full body. Slice 7 plan §"`changeType: 'deleted'` handling".
 */

export interface NormalizeContext {
  /** Graph subscription id from the notification envelope. */
  subscriptionId: string;
  /** "created" | "updated" | "deleted" — from notification, not body. */
  changeType: string;
  /** ISO-8601 timestamp from the notification or our receipt time. */
  notificationOccurredAt: string;
  /** Account id (email) from the integration row this trigger fired against. */
  accountId: string;
}

interface AddressShape {
  name: string;
  address: string;
}

interface AttendeeShape extends AddressShape {
  type: "required" | "optional" | "resource";
  status: { response: string; time: string | null };
}

function addr(
  field: { emailAddress?: { name?: string; address?: string } } | undefined,
): AddressShape | null {
  const ea = field?.emailAddress;
  if (!ea?.address) return null;
  return { name: ea.name ?? "", address: ea.address };
}

function attendeeList(input: GraphAttendee[] | undefined): AttendeeShape[] {
  if (!input) return [];
  const out: AttendeeShape[] = [];
  for (const a of input) {
    const base = addr(a);
    if (!base) continue;
    out.push({
      ...base,
      type: a.type ?? "required",
      status: {
        response: a.status?.response ?? "none",
        time: a.status?.time ?? null,
      },
    });
  }
  return out;
}

function normalizeBodyContentType(raw: unknown): "html" | "text" {
  if (typeof raw !== "string") return "text";
  return raw.toLowerCase() === "html" ? "html" : "text";
}

function buildEventId(ctx: NormalizeContext, eventId: string): string {
  return `${ctx.subscriptionId}:${eventId}:${ctx.changeType}`;
}

export function normalize(
  event: GraphEvent,
  context: NormalizeContext,
): TriggerEvent {
  const eventId = buildEventId(context, event.id);

  const body = event.body
    ? {
        contentType: normalizeBodyContentType(event.body.contentType),
        content: event.body.content ?? "",
      }
    : null;

  return {
    provider: "microsoft-outlook-calendar",
    eventType: "event_changed",
    eventId,
    occurredAt:
      event.lastModifiedDateTime ??
      event.createdDateTime ??
      context.notificationOccurredAt,
    accountId: context.accountId,
    payload: {
      eventId: event.id,
      changeType: context.changeType,
      subject: event.subject ?? "",
      start: event.start ?? null,
      end: event.end ?? null,
      isAllDay: event.isAllDay ?? false,
      location: event.location?.displayName ?? null,
      body,
      attendees: attendeeList(event.attendees),
      organizer: addr(event.organizer),
      isOnlineMeeting: event.isOnlineMeeting ?? false,
      onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? null,
      webLink: event.webLink ?? null,
      importance: event.importance ?? "normal",
      sensitivity: event.sensitivity ?? "normal",
      createdDateTime: event.createdDateTime ?? null,
      lastModifiedDateTime: event.lastModifiedDateTime ?? null,
    },
  };
}

/**
 * Minimal payload for `changeType: "deleted"` notifications when the
 * subsequent GET 404s. Slice 7 plan §"`changeType: 'deleted'` handling".
 *
 * Stable shape — keeps every payload key from `normalize()` so workflow
 * authors don't have to special-case the "missing body" path. Fields we
 * can't recover are `null` (or `false`/empty array for the boolean /
 * list fields). `subject: null` is the unambiguous signal "we know it
 * was deleted but couldn't fetch the body."
 */
export function normalizeDeleted(
  eventId: string,
  context: NormalizeContext,
): TriggerEvent {
  return {
    provider: "microsoft-outlook-calendar",
    eventType: "event_changed",
    eventId: buildEventId(context, eventId),
    occurredAt: context.notificationOccurredAt,
    accountId: context.accountId,
    payload: {
      eventId,
      changeType: context.changeType,
      subject: null,
      start: null,
      end: null,
      isAllDay: false,
      location: null,
      body: null,
      attendees: [],
      organizer: null,
      isOnlineMeeting: false,
      onlineMeetingUrl: null,
      webLink: null,
      importance: "normal",
      sensitivity: "normal",
      createdDateTime: null,
      lastModifiedDateTime: null,
    },
  };
}
