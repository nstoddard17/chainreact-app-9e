import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsList } from "../api/eventsList";
import { ListEventsConfigSchema } from "./listEvents.schema";

/**
 * Outlook Calendar list_events action handler.
 *
 * Two endpoint modes (decided in the wrapper):
 *   - With both startDateTime + endDateTime → /me/calendarView
 *     (auto-expands recurring events).
 *   - Without → /me/events (master events for recurring series).
 *
 * The schema's refine enforces both-or-neither; the wrapper picks
 * the path. Workflow authors get sensible behavior for both
 * "show me all my events" and "show me what's on my calendar this week."
 *
 * Output shape:
 *   { events: [{id, subject, start, end, isAllDay, location, attendees,
 *     organizer, isOnlineMeeting, onlineMeetingUrl, importance,
 *     sensitivity, showAs, webLink, createdDateTime,
 *     lastModifiedDateTime}], count, hasMore, nextLink }
 *
 * `nextLink` is surfaced for forward-compat (workflow authors can chain
 * a follow-up node that re-queries with `$skiptoken`); Slice 7 doesn't
 * auto-paginate.
 */
export const listEvents: ActionHandler = async (input) => {
  const config = ListEventsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook-calendar"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-outlook-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsList({
        accessToken,
        startDateTime: config.startDateTime,
        endDateTime: config.endDateTime,
        top: config.top,
        orderBy: config.orderBy,
        subjectFilter: config.subjectFilter,
      }),
  });

  return {
    output: {
      events: result.events.map((e) => ({
        id: e.id,
        subject: e.subject ?? "",
        start: e.start ?? null,
        end: e.end ?? null,
        isAllDay: e.isAllDay ?? false,
        location: e.location?.displayName ?? null,
        attendees: (e.attendees ?? []).map((a) => ({
          name: a.emailAddress.name ?? "",
          address: a.emailAddress.address,
          type: a.type,
          status: a.status?.response ?? null,
        })),
        organizer: e.organizer
          ? {
              name: e.organizer.emailAddress?.name ?? "",
              address: e.organizer.emailAddress?.address ?? "",
            }
          : null,
        isOnlineMeeting: e.isOnlineMeeting ?? false,
        onlineMeetingUrl: e.onlineMeeting?.joinUrl ?? null,
        importance: e.importance ?? "normal",
        sensitivity: e.sensitivity ?? "normal",
        showAs: e.showAs ?? null,
        webLink: e.webLink ?? null,
        createdDateTime: e.createdDateTime ?? null,
        lastModifiedDateTime: e.lastModifiedDateTime ?? null,
      })),
      count: result.events.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
