import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  memberArchive,
  memberDeletePermanent,
} from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { RemoveSubscriberConfigSchema } from "./removeSubscriber.schema";

/**
 * Mailchimp `remove_subscriber` action handler — Slice 14 Commit 3
 * (Q11 hot spot #2).
 *
 * Two modes (workflow author chooses explicitly per schema's Q11
 * gate):
 *   - `archive` — reversible. DELETE
 *     `/lists/{id}/members/{hash}` returns 204; the subscriber moves
 *     to Mailchimp's archive and can be re-subscribed later.
 *   - `delete_permanent` — irreversible. POST
 *     `/lists/{id}/members/{hash}/actions/delete-permanent` returns
 *     204; Mailchimp also blocks the same email from re-subscribing.
 *
 * Output shape: { email, audienceId, mode, deletedAt, permanent }.
 * `permanent: true` only when mode was `delete_permanent`.
 */
export const removeSubscriber: ActionHandler = async (input) => {
  const config = RemoveSubscriberConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      config.mode === "archive"
        ? memberArchive({
            accessToken,
            dc,
            audienceId: config.audience_id,
            email: config.email,
          })
        : memberDeletePermanent({
            accessToken,
            dc,
            audienceId: config.audience_id,
            email: config.email,
          }),
  });

  return {
    output: {
      email: config.email,
      audienceId: config.audience_id,
      mode: config.mode,
      deletedAt: new Date().toISOString(),
      permanent: config.mode === "delete_permanent",
    },
  };
};
