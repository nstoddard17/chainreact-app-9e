import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberSetTags } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { AddTagConfigSchema } from "./addTag.schema";

/**
 * Mailchimp `add_tag` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists/{audienceId}/members/{subscriberHash}/tags` with each
 * tag at `status: 'active'`. Mailchimp auto-creates tags that don't
 * already exist. Returns 204 No Content on success.
 *
 * Output shape: { email, audienceId, addedTags, addedAt }.
 */
export const addTag: ActionHandler = async (input) => {
  const config = AddTagConfigSchema.parse(input.config);

  const { dc, accountId } = await resolveDc({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  await refreshAndRetry({
    userId: input.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      memberSetTags({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        tags: config.tags.map((name) => ({ name, status: "active" as const })),
      }),
  });

  return {
    output: {
      email: config.email,
      audienceId: config.audience_id,
      addedTags: [...config.tags],
      addedAt: new Date().toISOString(),
    },
  };
};
