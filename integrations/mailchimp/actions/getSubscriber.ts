import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberGet } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { GetSubscriberConfigSchema } from "./getSubscriber.schema";

/**
 * Mailchimp `get_subscriber` action handler — Slice 14 Commit 3.
 *
 * GETs `/lists/{audienceId}/members/{subscriberHash}`. Returns the
 * full member object. NotFoundError surfaces to the workflow when
 * the subscriber doesn't exist (caller can branch on the error).
 *
 * Output shape: { subscriberId, email, status, listId, mergeFields,
 * tags, lastChanged }.
 */
export const getSubscriber: ActionHandler = async (input) => {
  const config = GetSubscriberConfigSchema.parse(input.config);

  const { dc, accountId } = await resolveDc({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const member = await refreshAndRetry({
    userId: input.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      memberGet({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
      }),
  });

  return {
    output: {
      subscriberId: member.id,
      email: member.email_address,
      status: member.status,
      listId: member.list_id,
      mergeFields: member.merge_fields ?? {},
      tags: (member.tags ?? []).map((t) => t.name),
      lastChanged: member.last_changed ?? null,
    },
  };
};
