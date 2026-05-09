import type { ActionHandler } from "@/services/execution/handlers/types";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsDelete } from "../api/eventsDelete";
import { DeleteEventConfigSchema } from "./deleteEvent.schema";

/**
 * Outlook Calendar delete_event action handler.
 *
 * Idempotent on 404: the wrapper throws `NotFoundError` when Graph
 * returns 404; the handler swallows it and returns
 * `{deleted: true, alreadyMissing: true}` so retry-after-success
 * succeeds with no API call rather than failing the workflow.
 * Mirrors Slice 4 deleteFile's convention.
 */
export const deleteEvent: ActionHandler = async (input) => {
  const config = DeleteEventConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-outlook-calendar"
      ? input.triggerEvent.accountId
      : null;

  try {
    await refreshAndRetry({
      userId: input.userId,
      provider: "microsoft-outlook-calendar",
      accountId,
      apiCall: (accessToken) =>
        eventsDelete({ accessToken, eventId: config.eventId }),
    });
    return {
      output: {
        eventId: config.eventId,
        deleted: true,
        alreadyMissing: false,
      },
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        output: {
          eventId: config.eventId,
          deleted: true,
          alreadyMissing: true,
        },
      };
    }
    throw err;
  }
};
