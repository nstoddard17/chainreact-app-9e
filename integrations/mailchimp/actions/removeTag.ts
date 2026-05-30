import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberSetTags } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { RemoveTagConfigSchema } from "./removeTag.schema";

/**
 * Mailchimp `remove_tag` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists/{audienceId}/members/{subscriberHash}/tags` with each
 * tag at `status: 'inactive'`. Mailchimp silently skips tags the
 * subscriber doesn't currently have. Returns 204 No Content on
 * success.
 *
 * Output shape: { email, audienceId, removedTags, removedAt }.
 */
export const removeTag: ActionHandler = async (input) => {
  const config = RemoveTagConfigSchema.parse(input.config);

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
      memberSetTags({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        tags: config.tags.map((name) => ({
          name,
          status: "inactive" as const,
        })),
      }),
  });

  return {
    output: {
      email: config.email,
      audienceId: config.audience_id,
      removedTags: [...config.tags],
      removedAt: new Date().toISOString(),
    },
  };
};
