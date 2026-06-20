import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersGetProfile } from "../api/usersGetProfile";
import { GetProfileConfigSchema } from "./getProfile.schema";

/**
 * Gmail `get_profile` action handler (Slice 4.GMAIL-READ-1).
 *
 * Read-only. Reuses the shared `usersGetProfile` wrapper (also used by the
 * trigger activation baseline) behind `refreshAndRetry` (Q3); GET-shaped so
 * no idempotency concern.
 *
 * Output is bounded and explicitly projected — the raw provider resource is
 * never spread. `emailAddress` is the connected account's own address (PII)
 * and is marked sensitive in the meta so the run-detail API redacts it. The
 * endpoint carries no message content / bodies / attachments.
 */
export const getProfile: ActionHandler = async (input) => {
  GetProfileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "gmail",
    providerAccountId,
    apiCall: (accessToken) => usersGetProfile({ accessToken }),
  });

  return {
    output: {
      emailAddress: result.emailAddress,
      messagesTotal: result.messagesTotal,
      threadsTotal: result.threadsTotal,
      historyId: result.historyId,
    },
  };
};
