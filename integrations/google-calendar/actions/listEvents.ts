import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsList } from "../api/eventsList";
import { ListEventsConfigSchema, type ListEventsConfig } from "./listEvents.schema";

/**
 * Google Calendar `events.list` action handler.
 *
 * Read-only. Returns the events array plus pagination tokens.
 * Output shape includes convenience fields (`firstEventId`, `lastEventId`)
 * so downstream nodes can reference the boundary events without indexing.
 */
export const listEvents: ActionHandler = async (input) => {
  const config: ListEventsConfig = ListEventsConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-calendar"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-calendar",
    accountId,
    apiCall: (accessToken) =>
      eventsList({
        accessToken,
        calendarId: config.calendarId,
        timeMin: config.timeMin,
        timeMax: config.timeMax,
        maxResults: config.maxResults,
        q: config.query,
        orderBy: config.orderBy,
        singleEvents: config.singleEvents,
        showDeleted: config.showDeleted,
        pageToken: config.pageToken,
      }),
  });

  const events = result.items ?? [];

  return {
    output: {
      events,
      count: events.length,
      firstEventId: events[0]?.id ?? null,
      lastEventId: events[events.length - 1]?.id ?? null,
      nextPageToken: result.nextPageToken ?? null,
      nextSyncToken: result.nextSyncToken ?? null,
      calendarId: config.calendarId,
      timeMin: config.timeMin ?? null,
      timeMax: config.timeMax ?? null,
    },
  };
};
