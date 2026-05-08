import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsDelete } from "../api/eventsDelete";
import { eventsGet } from "../api/eventsGet";
import { NotFoundError } from "../api/errors";
import { DeleteEventConfigSchema, type DeleteEventConfig } from "./deleteEvent.schema";

/**
 * Google Calendar `events.delete` action handler.
 *
 * Fetches the event first (best-effort) so the output can include
 * the original summary/start/end as a downstream-friendly snapshot. If
 * the event is already gone (404 from get OR delete), returns
 * `{ alreadyDeleted: true, deleted: true }` so retries don't fail.
 *
 * Q-contracts: Q3 refreshAndRetry; Q11 sendNotifications required.
 *
 * No Q4 storage in this slice — but the `alreadyDeleted` short-circuit
 * makes deleteEvent naturally idempotent at the API layer.
 */
export const deleteEvent: ActionHandler = async (input) => {
  const config: DeleteEventConfig = DeleteEventConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-calendar"
      ? input.triggerEvent.accountId
      : null;

  // Best-effort fetch for snapshot info. If it 404s, set alreadyDeleted and
  // skip the delete call.
  let originalSummary: string | null = null;
  let originalStart: Record<string, unknown> | null = null;
  let originalEnd: Record<string, unknown> | null = null;
  let alreadyDeleted = false;

  try {
    const original = await refreshAndRetry({
      userId: input.userId,
      provider: "google-calendar",
      accountId,
      apiCall: (accessToken) =>
        eventsGet({
          accessToken,
          calendarId: config.calendarId,
          eventId: config.eventId,
        }),
    });
    originalSummary = original.summary ?? null;
    originalStart = (original.start as Record<string, unknown> | undefined) ?? null;
    originalEnd = (original.end as Record<string, unknown> | undefined) ?? null;
  } catch (err) {
    if (err instanceof NotFoundError) {
      alreadyDeleted = true;
    } else {
      throw err;
    }
  }

  if (!alreadyDeleted) {
    try {
      await refreshAndRetry({
        userId: input.userId,
        provider: "google-calendar",
        accountId,
        apiCall: (accessToken) =>
          eventsDelete({
            accessToken,
            calendarId: config.calendarId,
            eventId: config.eventId,
            sendUpdates: config.sendNotifications,
          }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Race: someone else deleted it between the get and the delete.
        // Treat as successful (idempotent).
        alreadyDeleted = true;
      } else {
        throw err;
      }
    }
  }

  return {
    output: {
      eventId: config.eventId,
      deleted: true,
      alreadyDeleted,
      deletedAt: new Date().toISOString(),
      eventTitle: originalSummary,
      eventStart: originalStart,
      eventEnd: originalEnd,
      calendarId: config.calendarId,
    },
  };
};
